// judx-normalizer reconciler: merges overlapping STJ records from multiple sources

import type { JudxBundle } from '../shared/types';
import { getJudxClient } from '../shared/db';

// ---------------------------------------------------------------------------
// Name normalisation (for judge deduplication)
// ---------------------------------------------------------------------------

/**
 * Normalises a judge name for dedup comparison: lowercase, collapse whitespace,
 * strip common prefixes (Min., Ministro, Ministra, Dr., Des.).
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\b(?:min(?:istro|istra)?\.?|dr\.?|des\.?)\s*/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Reconciliation: merge two bundles for the same case
// ---------------------------------------------------------------------------

/**
 * Merges a primary and secondary JudxBundle that refer to the same case
 * (identified by processo number). The primary bundle is authoritative;
 * the secondary fills gaps and may win on higher-confidence inferences.
 *
 * Returns a new bundle — does not mutate inputs.
 */
export function reconcileBundles(
  primary: JudxBundle,
  secondary: JudxBundle | null,
): JudxBundle {
  if (!secondary) return { ...primary };

  const conflicts: Array<{ field: string; primaryValue: unknown; secondaryValue: unknown }> = [];

  // --- Helper: prefer primary unless it's null/empty and secondary has a value ---
  function pick<T>(field: string, a: T, b: T): T {
    const aEmpty = a === null || a === undefined || a === '';
    const bEmpty = b === null || b === undefined || b === '';

    if (!aEmpty) {
      // Log conflict if both have values and they differ
      if (!bEmpty && a !== b) {
        conflicts.push({ field, primaryValue: a, secondaryValue: b });
      }
      return a;
    }
    return bEmpty ? a : b;
  }

  // --- Environment: prefer higher confidence ---
  let environment: JudxBundle['environment'];
  if (
    secondary.environment.confidence > primary.environment.confidence &&
    secondary.environment.inferred !== 'nao_informado'
  ) {
    environment = { ...secondary.environment };
    if (
      primary.environment.inferred !== 'nao_informado' &&
      primary.environment.inferred !== secondary.environment.inferred
    ) {
      conflicts.push({
        field: 'environment',
        primaryValue: primary.environment,
        secondaryValue: secondary.environment,
      });
    }
  } else {
    environment = { ...primary.environment };
  }

  // --- Rapporteur outcome: prefer higher confidence ---
  let rapporteurOutcome: JudxBundle['rapporteurOutcome'];
  if (primary.rapporteurOutcome && secondary.rapporteurOutcome) {
    if (secondary.rapporteurOutcome.confidence > primary.rapporteurOutcome.confidence) {
      rapporteurOutcome = { ...secondary.rapporteurOutcome };
      if (primary.rapporteurOutcome.outcome !== secondary.rapporteurOutcome.outcome) {
        conflicts.push({
          field: 'rapporteurOutcome',
          primaryValue: primary.rapporteurOutcome,
          secondaryValue: secondary.rapporteurOutcome,
        });
      }
    } else {
      rapporteurOutcome = { ...primary.rapporteurOutcome };
    }
  } else {
    rapporteurOutcome = primary.rapporteurOutcome ?? secondary.rapporteurOutcome ?? null;
  }

  // --- Judges: merge & deduplicate by normalised name ---
  const judgeMap = new Map<string, JudxBundle['judges'][number]>();
  for (const j of primary.judges) {
    judgeMap.set(normalizeName(j.name), { ...j });
  }
  for (const j of secondary.judges) {
    const key = normalizeName(j.name);
    if (!judgeMap.has(key)) {
      judgeMap.set(key, { ...j });
    }
    // If already present from primary, primary wins — no overwrite
  }
  const judges = Array.from(judgeMap.values());

  // --- Environment events: merge & deduplicate ---
  const eventKeys = new Set<string>();
  const environmentEvents: JudxBundle['environmentEvents'] = [];
  for (const ev of [...primary.environmentEvents, ...secondary.environmentEvents]) {
    const key = `${ev.eventType}::${ev.toEnvironment}::${ev.evidence ?? ''}`;
    if (!eventKeys.has(key)) {
      eventKeys.add(key);
      environmentEvents.push({ ...ev });
    }
  }

  // --- Latent signals: merge & deduplicate ---
  const signalKeys = new Set<string>();
  const latentSignals: JudxBundle['latentSignals'] = [];
  for (const sig of [...primary.latentSignals, ...secondary.latentSignals]) {
    const key = `${sig.domain}::${sig.name}`;
    if (!signalKeys.has(key)) {
      signalKeys.add(key);
      latentSignals.push({ ...sig });
    }
  }

  // --- Decision: merge field-by-field ---
  const decision: JudxBundle['decision'] = {
    date: pick('decision.date', primary.decision.date, secondary.decision.date),
    kind: pick('decision.kind', primary.decision.kind, secondary.decision.kind),
    result: pick('decision.result', primary.decision.result, secondary.decision.result),
    fullText: pick('decision.fullText', primary.decision.fullText, secondary.decision.fullText),
    excerpt: pick('decision.excerpt', primary.decision.excerpt, secondary.decision.excerpt),
    metadata: {
      ...secondary.decision.metadata,
      ...primary.decision.metadata,
    },
  };

  // --- Build reconciled bundle ---
  const reconciled: JudxBundle = {
    courtId: primary.courtId,
    courtAcronym: primary.courtAcronym,
    externalNumber: pick('externalNumber', primary.externalNumber, secondary.externalNumber),
    organName: pick('organName', primary.organName, secondary.organName),
    proceduralClassName: pick(
      'proceduralClassName',
      primary.proceduralClassName,
      secondary.proceduralClassName,
    ),
    subject: pick('subject', primary.subject, secondary.subject),

    decision,
    judges,
    environment,
    rapporteurOutcome,
    latentSignals,
    environmentEvents,

    sourceTable: primary.sourceTable,
    sourceId: primary.sourceId,
    rawMetadata: {
      primary_source: primary.rawMetadata,
      secondary_source: secondary.rawMetadata,
      reconciliation_conflicts: conflicts,
      reconciled_from: [
        { table: primary.sourceTable, id: primary.sourceId },
        { table: secondary.sourceTable, id: secondary.sourceId },
      ],
    },
  };

  // Log conflicts at console level (no logger module yet — use console.warn)
  if (conflicts.length > 0) {
    console.warn(
      `[stjSourceReconciler] ${conflicts.length} conflict(s) reconciling ` +
        `${primary.sourceTable}:${primary.sourceId} vs ${secondary.sourceTable}:${secondary.sourceId}`,
    );
    for (const c of conflicts) {
      console.warn(`  - ${c.field}: primary=${JSON.stringify(c.primaryValue)} vs secondary=${JSON.stringify(c.secondaryValue)}`);
    }
  }

  return reconciled;
}

// ---------------------------------------------------------------------------
// Reconciliation map: find overlapping cases across both tables
// ---------------------------------------------------------------------------

/**
 * Queries both `stj_decisions` and `stj_decisoes_dj` to find processo numbers
 * that appear in both tables. Returns a Map where:
 *   key   = processo number (normalised)
 *   value = array of source identifiers in the form "table::id"
 *
 * This map enables the pipeline to know which records need reconciliation
 * before writing to the normalised store.
 */
export async function buildReconciliationMap(): Promise<Map<string, string[]>> {
  const client = getJudxClient();
  const map = new Map<string, string[]>();

  // Fetch all processo identifiers from stj_decisions
  const BATCH = 1000;
  let offset = 0;

  // --- stj_decisions ---
  while (true) {
    const { data, error } = await client
      .from('stj_decisions')
      .select('numero_registro, processo')
      .range(offset, offset + BATCH - 1);

    if (error) {
      throw new Error(
        `[stjSourceReconciler] Failed to read stj_decisions for reconciliation at offset ${offset}: ${error.message}`,
      );
    }

    const rows = data as Array<{ numero_registro: string; processo: string }> | null;
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const key = (row.processo ?? '').trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key) ?? [];
      existing.push(`stj_decisions::${row.numero_registro}`);
      map.set(key, existing);
    }

    if (rows.length < BATCH) break;
    offset += BATCH;
  }

  // --- stj_decisoes_dj ---
  offset = 0;
  while (true) {
    const { data, error } = await client
      .from('stj_decisoes_dj')
      .select('id, numero_processo')
      .range(offset, offset + BATCH - 1);

    if (error) {
      throw new Error(
        `[stjSourceReconciler] Failed to read stj_decisoes_dj for reconciliation at offset ${offset}: ${error.message}`,
      );
    }

    const rows = data as Array<{ id: number; numero_processo: string }> | null;
    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      const key = (row.numero_processo ?? '').trim().toLowerCase();
      if (!key) continue;
      const existing = map.get(key) ?? [];
      existing.push(`stj_decisoes_dj::${row.id}`);
      map.set(key, existing);
    }

    if (rows.length < BATCH) break;
    offset += BATCH;
  }

  // Filter: keep only entries that appear in MORE than one source
  const reconciliationMap = new Map<string, string[]>();
  for (const [key, sources] of map) {
    const tables = new Set(sources.map((s) => s.split('::')[0]));
    if (tables.size > 1) {
      reconciliationMap.set(key, sources);
    }
  }

  console.info(
    `[stjSourceReconciler] Reconciliation map built: ${reconciliationMap.size} overlapping case(s) found`,
  );

  return reconciliationMap;
}
