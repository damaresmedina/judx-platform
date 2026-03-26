import type { StjDecisionRow } from "./stj-sync";

// ────────────────────────────────────────────────────────────
// Slugify
// ────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

// ────────────────────────────────────────────────────────────
// Classes processuais conhecidas do STJ → tipos ICONS
// O sistema auto-expande: classes fora deste mapa são propostas
// como novos tipos e inseridas automaticamente na taxonomia.
// ────────────────────────────────────────────────────────────

const STJ_CLASS_MAP: Record<string, { type_slug: string; label: string }> = {
  REsp:   { type_slug: "recurso_especial",             label: "Recurso Especial" },
  AgRg:   { type_slug: "agravo_regimental",            label: "Agravo Regimental" },
  AgInt:  { type_slug: "agravo_interno",               label: "Agravo Interno" },
  AREsp:  { type_slug: "agravo_recurso_especial",      label: "Agravo em Recurso Especial" },
  HC:     { type_slug: "habeas_corpus",                label: "Habeas Corpus" },
  RHC:    { type_slug: "recurso_habeas_corpus",        label: "Recurso em Habeas Corpus" },
  RMS:    { type_slug: "recurso_mandado_seguranca",    label: "Recurso em Mandado de Segurança" },
  MS:     { type_slug: "mandado_seguranca",            label: "Mandado de Segurança" },
  EDcl:   { type_slug: "embargos_declaracao",          label: "Embargos de Declaração" },
  EREsp:  { type_slug: "embargos_divergencia_resp",    label: "Embargos de Divergência em REsp" },
  CC:     { type_slug: "conflito_competencia",         label: "Conflito de Competência" },
  Pet:    { type_slug: "peticao",                      label: "Petição" },
  Rcl:    { type_slug: "reclamacao",                   label: "Reclamação" },
  RO:     { type_slug: "recurso_ordinario",            label: "Recurso Ordinário" },
  IDC:    { type_slug: "incidente_deslocamento",       label: "Incidente de Deslocamento de Competência" },
  SE:     { type_slug: "sentenca_estrangeira",         label: "Sentença Estrangeira" },
  CR:     { type_slug: "carta_rogatoria",              label: "Carta Rogatória" },
  AR:     { type_slug: "acao_rescisoria",              label: "Ação Rescisória" },
};

// ────────────────────────────────────────────────────────────
// Tipos de retorno
// ────────────────────────────────────────────────────────────

export type IconsTypeSeed = {
  type_slug: string;
  domain_slug: string;
  class_field: string;
  label: string;
};

export type IconsObjectInsert = {
  slug: string;
  type_slug: string;
  payload: Record<string, unknown>;
  valid_from: string | null;
};

export type IconsActorInsert = {
  slug: string;
  type_slug: string;
  payload: Record<string, unknown>;
  valid_from: string | null;
};

export type IconsEdgePlan = {
  type_slug: string;
  source_slug: string;
  target_slug: string;
  weight: number | null;
  payload: Record<string, unknown> | null;
};

export type IconsProvenanceInsert = {
  target_slug: string;
  target_table: string;
  source_type: string;
  source_url: string | null;
  pipeline_version: string;
  confidence: number;
};

export type IconsProposalInsert = {
  proposal_type: string;
  description: string;
  evidence_payload: Record<string, unknown>;
  confidence_score: number;
};

export type IconsInsertPlan = {
  objectTypesToEnsure: IconsTypeSeed[];
  actorTypesToEnsure: IconsTypeSeed[];
  objects: IconsObjectInsert[];
  actors: IconsActorInsert[];
  edges: IconsEdgePlan[];
  provenance: IconsProvenanceInsert[];
  proposals: IconsProposalInsert[];
};

// ────────────────────────────────────────────────────────────
// Mapper principal
// ────────────────────────────────────────────────────────────

const PIPELINE_VERSION = "judx-icons-bridge-v1";

export function decisionToIconsObjects(
  decision: StjDecisionRow,
  courtId: string = "stj",
): IconsInsertPlan {
  const plan: IconsInsertPlan = {
    objectTypesToEnsure: [],
    actorTypesToEnsure: [],
    objects: [],
    actors: [],
    edges: [],
    provenance: [],
    proposals: [],
  };

  // ── Tipo da decisão ──────────────────────────────────────
  const classeRaw = (decision.classe ?? "").trim();
  const mapped = classeRaw ? STJ_CLASS_MAP[classeRaw] : null;

  let typeSlug: string;
  let typeLabel: string;

  if (mapped) {
    typeSlug = mapped.type_slug;
    typeLabel = mapped.label;
  } else if (classeRaw) {
    typeSlug = slugify(classeRaw);
    typeLabel = classeRaw;
    plan.proposals.push({
      proposal_type: "new_decision_pattern",
      description: `Classe processual não mapeada no ${courtId.toUpperCase()}: "${classeRaw}"`,
      evidence_payload: {
        court_id: courtId,
        classe_raw: classeRaw,
        suggested_type_slug: typeSlug,
        suggested_label: typeLabel,
        sample_numero_registro: decision.numero_registro,
        sample_processo: decision.processo,
      },
      confidence_score: 0.4,
    });
  } else {
    typeSlug = `decisao_generica_${courtId}`;
    typeLabel = `Decisão ${courtId.toUpperCase()} (classe indeterminada)`;
  }

  plan.objectTypesToEnsure.push({
    type_slug: typeSlug,
    domain_slug: "juridico",
    class_field: "processual",
    label: typeLabel,
  });

  // ── Object: a decisão ────────────────────────────────────
  const decisionSlug = `${courtId}-${decision.numero_registro}`;
  plan.objects.push({
    slug: decisionSlug,
    type_slug: typeSlug,
    payload: {
      court_id: courtId,
      numero_registro: decision.numero_registro,
      processo: decision.processo,
      classe: decision.classe,
      uf: decision.uf,
      orgao_julgador: decision.orgao_julgador,
      ementa: decision.ementa,
      tema: decision.tema,
      resultado: decision.resultado,
      ramo_direito: decision.ramo_direito,
    },
    valid_from: decision.data_julgamento,
  });

  // ── Provenance ───────────────────────────────────────────
  plan.provenance.push({
    target_slug: decisionSlug,
    target_table: "objects",
    source_type: "pipeline",
    source_url: "https://dadosabertos.web.stj.jus.br",
    pipeline_version: PIPELINE_VERSION,
    confidence: 0.95,
  });

  // ── Actor: relator ───────────────────────────────────────
  if (decision.relator) {
    const relatorSlug = `${courtId}-ministro-${slugify(decision.relator)}`;
    const actorTypeSlug = `ministro_${courtId}`;

    plan.actorTypesToEnsure.push({
      type_slug: actorTypeSlug,
      domain_slug: "juridico",
      class_field: "institucional",
      label: `Ministro(a) do ${courtId.toUpperCase()}`,
    });

    plan.actors.push({
      slug: relatorSlug,
      type_slug: actorTypeSlug,
      payload: {
        court_id: courtId,
        nome: decision.relator,
      },
      valid_from: null,
    });

    plan.edges.push({
      type_slug: "relator_de",
      source_slug: relatorSlug,
      target_slug: decisionSlug,
      weight: null,
      payload: null,
    });
  }

  // ── Object: órgão julgador ───────────────────────────────
  if (decision.orgao_julgador) {
    const orgaoSlug = `${courtId}-orgao-${slugify(decision.orgao_julgador)}`;

    plan.objectTypesToEnsure.push({
      type_slug: "orgao_julgador",
      domain_slug: "juridico",
      class_field: "estrutural",
      label: "Órgão Julgador",
    });

    plan.objects.push({
      slug: orgaoSlug,
      type_slug: "orgao_julgador",
      payload: {
        court_id: courtId,
        nome: decision.orgao_julgador,
      },
      valid_from: null,
    });

    plan.edges.push({
      type_slug: "exerce_papel",
      source_slug: orgaoSlug,
      target_slug: decisionSlug,
      weight: null,
      payload: { papel: "orgao_julgador" },
    });
  }

  // ── Object: tema/subject ─────────────────────────────────
  if (decision.tema) {
    const temaSlug = `${courtId}-tema-${slugify(decision.tema).slice(0, 100)}`;

    plan.objects.push({
      slug: temaSlug,
      type_slug: "subject",
      payload: {
        court_id: courtId,
        descricao: decision.tema,
      },
      valid_from: null,
    });

    plan.edges.push({
      type_slug: "sobre",
      source_slug: decisionSlug,
      target_slug: temaSlug,
      weight: 0.7,
      payload: null,
    });
  }

  return plan;
}
