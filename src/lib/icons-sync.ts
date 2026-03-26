import type { SupabaseClient } from "@supabase/supabase-js";
import { getIconsServiceClient, isIconsConfigured } from "./icons-client";
import {
  decisionToIconsObjects,
  type IconsInsertPlan,
  type IconsTypeSeed,
} from "./icons-mapper";
import { proposeOrIncrement } from "./icons-learn";
import type { StjDecisionRow } from "./stj-sync";

// ────────────────────────────────────────────────────────────
// Constantes
// ────────────────────────────────────────────────────────────

const BATCH_SIZE = 100;
const LOG_PREFIX = "[icons-sync]";

// ────────────────────────────────────────────────────────────
// Ensure types (auto-expansão da taxonomia)
// ────────────────────────────────────────────────────────────

async function ensureObjectTypes(client: SupabaseClient, types: IconsTypeSeed[]): Promise<void> {
  if (types.length === 0) return;

  const rows = types.map((t) => ({
    type_slug: t.type_slug,
    domain_slug: t.domain_slug,
    ontological_class: t.class_field,
    label: t.label,
  }));

  const { error } = await client
    .from("object_types")
    .upsert(rows, { onConflict: "type_slug", ignoreDuplicates: true });

  if (error) {
    console.warn(`${LOG_PREFIX} ensureObjectTypes:`, error.message);
  }
}

async function ensureActorTypes(client: SupabaseClient, types: IconsTypeSeed[]): Promise<void> {
  if (types.length === 0) return;

  const rows = types.map((t) => ({
    type_slug: t.type_slug,
    domain_slug: t.domain_slug,
    actor_class: t.class_field,
    label: t.label,
  }));

  const { error } = await client
    .from("actor_types")
    .upsert(rows, { onConflict: "type_slug", ignoreDuplicates: true });

  if (error) {
    console.warn(`${LOG_PREFIX} ensureActorTypes:`, error.message);
  }
}

// ────────────────────────────────────────────────────────────
// Resolve slugs → UUIDs
// ────────────────────────────────────────────────────────────

async function resolveSlugMap(
  client: SupabaseClient,
  table: "objects" | "actors",
  slugs: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (slugs.length === 0) return map;

  const unique = [...new Set(slugs)];
  for (let i = 0; i < unique.length; i += 500) {
    const batch = unique.slice(i, i + 500);
    const { data } = await client
      .from(table)
      .select("id, slug")
      .in("slug", batch);

    if (data) {
      for (const row of data) {
        map.set(row.slug, row.id);
      }
    }
  }
  return map;
}

// ────────────────────────────────────────────────────────────
// Executar um plano consolidado
// ────────────────────────────────────────────────────────────

async function executePlan(client: SupabaseClient, plan: IconsInsertPlan): Promise<void> {
  // 1. Garantir tipos na taxonomia (DNA se expande)
  const objTypes = new Map<string, IconsTypeSeed>();
  for (const t of plan.objectTypesToEnsure) objTypes.set(t.type_slug, t);
  await ensureObjectTypes(client, [...objTypes.values()]);

  const actTypes = new Map<string, IconsTypeSeed>();
  for (const t of plan.actorTypesToEnsure) actTypes.set(t.type_slug, t);
  await ensureActorTypes(client, [...actTypes.values()]);

  // 2. Upsert objects (deduplica por slug)
  const uniqueObjects = new Map<string, (typeof plan.objects)[0]>();
  for (const o of plan.objects) uniqueObjects.set(o.slug, o);
  const objectRows = [...uniqueObjects.values()];

  for (let i = 0; i < objectRows.length; i += BATCH_SIZE) {
    const batch = objectRows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from("objects")
      .upsert(
        batch.map((o) => ({
          slug: o.slug,
          type_slug: o.type_slug,
          payload: o.payload,
          valid_from: o.valid_from,
        })),
        { onConflict: "slug", ignoreDuplicates: false },
      );
    if (error) console.warn(`${LOG_PREFIX} upsert objects:`, error.message);
  }

  // 3. Upsert actors (deduplica por slug)
  const uniqueActors = new Map<string, (typeof plan.actors)[0]>();
  for (const a of plan.actors) uniqueActors.set(a.slug, a);
  const actorRows = [...uniqueActors.values()];

  for (let i = 0; i < actorRows.length; i += BATCH_SIZE) {
    const batch = actorRows.slice(i, i + BATCH_SIZE);
    const { error } = await client
      .from("actors")
      .upsert(
        batch.map((a) => ({
          slug: a.slug,
          type_slug: a.type_slug,
          payload: a.payload,
          valid_from: a.valid_from,
        })),
        { onConflict: "slug", ignoreDuplicates: false },
      );
    if (error) console.warn(`${LOG_PREFIX} upsert actors:`, error.message);
  }

  // 4. Resolver slugs → UUIDs para edges e provenance
  const allSlugs = new Set<string>();
  for (const e of plan.edges) {
    allSlugs.add(e.source_slug);
    allSlugs.add(e.target_slug);
  }
  for (const p of plan.provenance) allSlugs.add(p.target_slug);

  const objectMap = await resolveSlugMap(client, "objects", [...allSlugs]);
  const actorMap = await resolveSlugMap(client, "actors", [...allSlugs]);
  const slugToUuid = new Map([...objectMap, ...actorMap]);

  // 5. Inserir edges (skip se source/target não resolveu)
  const edgesToInsert = plan.edges
    .map((e) => {
      const sourceId = slugToUuid.get(e.source_slug);
      const targetId = slugToUuid.get(e.target_slug);
      if (!sourceId || !targetId) return null;
      return {
        type_slug: e.type_slug,
        source_id: sourceId,
        target_id: targetId,
        weight: e.weight,
        payload: e.payload,
      };
    })
    .filter((e): e is NonNullable<typeof e> => e !== null);

  for (let i = 0; i < edgesToInsert.length; i += BATCH_SIZE) {
    const batch = edgesToInsert.slice(i, i + BATCH_SIZE);
    const { error } = await client.from("edges").insert(batch);
    if (error) {
      // Edge duplicates (allows_multiple=false) are expected — log without alarm
      if (!error.message.includes("não permite múltiplos")) {
        console.warn(`${LOG_PREFIX} insert edges:`, error.message);
      }
    }
  }

  // 6. Inserir provenance
  const provRows = plan.provenance
    .map((p) => {
      const targetId = slugToUuid.get(p.target_slug);
      if (!targetId) return null;
      return {
        target_id: targetId,
        target_table: p.target_table,
        source_type: p.source_type,
        source_url: p.source_url,
        pipeline_version: p.pipeline_version,
        confidence: p.confidence,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p !== null);

  for (let i = 0; i < provRows.length; i += BATCH_SIZE) {
    const batch = provRows.slice(i, i + BATCH_SIZE);
    const { error } = await client.from("provenance").insert(batch);
    if (error) console.warn(`${LOG_PREFIX} insert provenance:`, error.message);
  }

  // 7. Registrar propostas de padrões novos (auto-aprendizagem)
  for (const p of plan.proposals) {
    await proposeOrIncrement(
      p.proposal_type,
      `${p.evidence_payload.court_id ?? ""}:${p.evidence_payload.classe_raw ?? p.proposal_type}`,
      p.evidence_payload,
      p.confidence_score,
    ).catch((err) => {
      console.warn(`${LOG_PREFIX} proposal failed:`, err?.message ?? err);
    });
  }
}

// ────────────────────────────────────────────────────────────
// API pública
// ────────────────────────────────────────────────────────────

/**
 * Sincroniza uma única decisão para o ICONS.
 * Nunca lança exceção — erros são logados silenciosamente.
 */
export async function syncDecisionToIcons(
  decision: StjDecisionRow,
  courtId: string = "stj",
): Promise<void> {
  if (!isIconsConfigured()) return;

  try {
    const client = getIconsServiceClient();
    const plan = decisionToIconsObjects(decision, courtId);
    await executePlan(client, plan);
  } catch (err) {
    console.warn(
      `${LOG_PREFIX} syncDecisionToIcons failed for ${decision.numero_registro}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * Sincroniza um lote de decisões para o ICONS.
 * Consolida todos os planos em um único para eficiência.
 * Nunca lança exceção — erros são logados silenciosamente.
 */
export async function syncDecisionsToIconsBatch(
  decisions: StjDecisionRow[],
  courtId: string = "stj",
): Promise<void> {
  if (!isIconsConfigured()) return;
  if (decisions.length === 0) return;

  try {
    const client = getIconsServiceClient();

    // Consolida todos os planos individuais em um plano único
    const merged: IconsInsertPlan = {
      objectTypesToEnsure: [],
      actorTypesToEnsure: [],
      objects: [],
      actors: [],
      edges: [],
      provenance: [],
      proposals: [],
    };

    for (const decision of decisions) {
      const plan = decisionToIconsObjects(decision, courtId);
      merged.objectTypesToEnsure.push(...plan.objectTypesToEnsure);
      merged.actorTypesToEnsure.push(...plan.actorTypesToEnsure);
      merged.objects.push(...plan.objects);
      merged.actors.push(...plan.actors);
      merged.edges.push(...plan.edges);
      merged.provenance.push(...plan.provenance);
      merged.proposals.push(...plan.proposals);
    }

    // Deduplica proposals pelo match_key
    const seenProposals = new Set<string>();
    merged.proposals = merged.proposals.filter((p) => {
      const key = `${p.proposal_type}:${p.evidence_payload.classe_raw ?? ""}`;
      if (seenProposals.has(key)) return false;
      seenProposals.add(key);
      return true;
    });

    await executePlan(client, merged);

    console.log(
      `${LOG_PREFIX} batch sync: ${decisions.length} decisões → ` +
        `${merged.objects.length} objects, ${merged.actors.length} actors, ` +
        `${merged.edges.length} edges, ${merged.proposals.length} proposals`,
    );
  } catch (err) {
    console.warn(
      `${LOG_PREFIX} syncDecisionsToIconsBatch failed:`,
      err instanceof Error ? err.message : err,
    );
  }
}
