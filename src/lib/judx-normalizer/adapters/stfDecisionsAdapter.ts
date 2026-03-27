// Adaptador exclusivo STF — lê stf_decisoes, nunca stf_decisions ou tabelas STJ
// Fonte: stf_decisoes (32 cols — datasets 372e + e7a4 + 7c9f merge)
// Mapeamento completo: processo → judx_case, processo+cod_andamento → judx_decision

import type { StfDecisaoRaw, JudxBundle } from '../shared/types';
import { getJudxClient } from '../shared/db';
import { COURT_STF_ACRONYM, BATCH_SIZE, DEFAULT_ENVIRONMENT } from '../shared/constants';
import type { ConfidenceSource } from '../shared/confidence';

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

function inferRamo(classe: string | null, grupoOrigem: string | null): string {
  const c = (classe ?? '').toUpperCase().trim();
  if (['ADI', 'ADC', 'ADPF', 'ADO'].includes(c)) return 'controle_concentrado';
  if (['RE', 'ARE'].includes(c) && grupoOrigem === 'Recursal') return 'controle_incidental';
  if (c === 'RCL') return 'reclamacao';
  return 'competencia_originaria';
}

const KIND_MAP: Record<string, string> = {
  'colegiada': 'acordao',
  'monocratica': 'monocratica',
  'monocrática': 'monocratica',
};

function inferKind(tipoDecisao: string | null): string {
  const raw = (tipoDecisao ?? '').toUpperCase().trim();
  if (!raw) return 'outra';

  const lower = raw.toLowerCase();
  if (KIND_MAP[lower]) return KIND_MAP[lower];

  if (/final/i.test(raw)) return 'acordao';
  if (/recurso\s+interno/i.test(raw)) return 'acordao';
  if (/interlocut[oó]ria/i.test(raw)) return 'decisao_interlocutoria';
  if (/sobrestamento/i.test(raw)) return 'outra';
  return 'outra';
}

// Padrões que indicam decisão sem apreciação de mérito (79%+ do STF)
const SEM_MERITO_PATTERNS = [
  'agravo regimental não provido', 'agravo regimental não conhecido',
  'embargos rejeitados', 'embargos não conhecidos',
  'negado seguimento', 'determinada a devolução',
  'embargos recebidos como agravo',
];

function hasMeritAppraisal(descLower: string): boolean {
  return !SEM_MERITO_PATTERNS.some(p => descLower.includes(p));
}

/**
 * Taxonomia decisória real do STF.
 * Ordem importa: patterns mais específicos primeiro (includes match).
 */
function inferResult(descricao: string | null, subgrupo: string | null): string {
  const d = (descricao ?? '').toLowerCase().trim();
  if (!d || d === '-' || d === '*ni*') return 'nao_conhecido';

  // ── Recursos internos — sem apreciação de mérito ──
  if (d.includes('agravo regimental não provido')) return 'improcedente';
  if (d.includes('agravo regimental não conhecido')) return 'nao_conhecido';
  if (d.includes('agravo regimental provido em parte')) return 'parcialmente_procedente';
  if (d.includes('agravo regimental provido')) return 'procedente';
  if (d.includes('embargos rejeitados')) return 'improcedente';
  if (d.includes('embargos não conhecidos')) return 'nao_conhecido';
  if (d.includes('embargos recebidos em parte')) return 'parcialmente_procedente';
  if (d.includes('embargos recebidos como agravo')) return 'improcedente';
  if (d.includes('embargos recebidos')) return 'procedente';

  // ── Terminativas sem mérito ──
  if (d.includes('negado seguimento')) return 'nao_conhecido';
  if (d.includes('determinada a devolução')) return 'prejudicado';
  if (d.includes('homologada a desistência')) return 'prejudicado';
  if (d.includes('extinto o processo')) return 'prejudicado';
  if (d.includes('prejudicado')) return 'prejudicado';
  if (d.includes('determinado arquivamento')) return 'prejudicado';
  if (d.includes('declarada a extinção da punibilidade')) return 'prejudicado';
  if (d.includes('reconsidero e determino')) return 'nao_conhecido';

  // ── Mérito — recursos ──
  if (d.includes('provido em parte')) return 'parcialmente_procedente';
  if (d.includes('não provido')) return 'improcedente';
  if (d.includes('provido')) return 'procedente';

  // ── Mérito — ações originárias ──
  if (d.includes('procedente em parte')) return 'parcialmente_procedente';
  if (d.includes('procedente')) return 'procedente';
  if (d.includes('improcedente')) return 'improcedente';
  if (d.includes('não conhecido')) return 'nao_conhecido';

  // ── HC / MS ──
  if (d.includes('concedida a ordem')) return 'procedente';
  if (d.includes('denegada a ordem')) return 'improcedente';
  if (d.includes('denegada a segurança')) return 'improcedente';
  if (d.includes('denegada a suspensão')) return 'improcedente';
  if (d.includes('deferido em parte')) return 'parcialmente_procedente';
  if (d.includes('deferido')) return 'deferido';
  if (d.includes('indeferido')) return 'indeferido';
  if (d.includes('liminar referendada')) return 'deferido';
  if (d.includes('liminar indeferida')) return 'indeferido';

  // ── Repercussão Geral ──
  if (d.includes('existência de repercussão geral')) return 'procedente';
  if (d.includes('inexistência de repercussão geral')) return 'improcedente';
  if (d.includes('julgado mérito de tema')) return 'procedente';
  if (d.includes('reconhecida a repercussão geral')) return 'procedente';

  // ── Penal ──
  if (d.includes('recebida denúncia')) return 'procedente';

  // ── Outros ──
  if (d.includes('decisão referendada')) return 'deferido';
  if (d.includes('segredo de justiça')) return 'nao_conhecido';
  if (d.includes('sobrestado')) return 'prejudicado';

  return 'nao_conhecido';
}

function parseEnvironment(
  ambienteJulgamento: string | null,
): { inferred: string; source: ConfidenceSource; confidence: number; evidence: string | null } {
  const raw = (ambienteJulgamento ?? '').trim().toLowerCase();

  if (!raw || raw === '-' || raw === '*ni*') {
    return { inferred: DEFAULT_ENVIRONMENT, source: 'heuristic', confidence: 0, evidence: null };
  }

  if (/virtual/i.test(raw)) {
    return { inferred: 'virtual', source: 'structured_field', confidence: 0.95, evidence: ambienteJulgamento! };
  }

  if (/presencial|f[ií]sic/i.test(raw)) {
    return { inferred: 'presencial', source: 'structured_field', confidence: 0.95, evidence: ambienteJulgamento! };
  }

  return { inferred: raw, source: 'structured_field', confidence: 0.70, evidence: ambienteJulgamento! };
}

function safe(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed || trimmed === '-' || trimmed === '*NI*') return null;
  return trimmed;
}

// ---------------------------------------------------------------------------
// Reader — paginated async generator from stf_decisoes
// ---------------------------------------------------------------------------

export async function* readStfDecisoes(
  batchSize: number = BATCH_SIZE,
): AsyncGenerator<StfDecisaoRaw[]> {
  const client = getJudxClient();
  let offset = 0;

  while (true) {
    const { data, error } = await client
      .from('stf_decisoes')
      .select('*')
      .range(offset, offset + batchSize - 1);

    if (error) {
      throw new Error(
        `[stfDecisionsAdapter] Failed to read stf_decisoes at offset ${offset}: ${error.message}`,
      );
    }

    const rows = (data ?? []) as StfDecisaoRaw[];
    if (rows.length === 0) break;
    yield rows;
    if (rows.length < batchSize) break;
    offset += batchSize;
  }
}

// ---------------------------------------------------------------------------
// Adapter — raw stf_decisoes row → JudxBundle
// ---------------------------------------------------------------------------

export function adaptStfDecisao(raw: StfDecisaoRaw): JudxBundle {
  const relatorDecisao = safe(raw.relator_decisao);
  const relatorAtual = safe(raw.relator_atual);
  const environment = parseEnvironment(raw.ambiente_julgamento);
  const summary = safe(raw.observacao_andamento);
  // Se classe vier null do banco, extrai do processo: "ARE 863446" → "ARE"
  const classe = safe(raw.classe) || raw.processo?.split(' ')[0]?.toUpperCase() || null;
  const grupoOrigem = safe(raw.grupo_origem);

  // Judges
  const judges: JudxBundle['judges'] = [];
  if (relatorDecisao) {
    judges.push({
      name: relatorDecisao,
      role: 'relator',
      voteType: 'vencedor',
      isRelator: true,
      isRelatorParaAcordao: false,
      relatorPrevailed: null,
      relatorDefeatedMarker: null,
    });
  }
  if (relatorAtual && relatorAtual !== relatorDecisao) {
    judges.push({
      name: relatorAtual,
      role: 'relator_atual',
      voteType: 'vencedor',
      isRelator: false,
      isRelatorParaAcordao: false,
      relatorPrevailed: null,
      relatorDefeatedMarker: null,
    });
  }

  // Latent signals
  const latentSignals: JudxBundle['latentSignals'] = [];
  const orgao = (raw.orgao_julgador ?? '').toUpperCase();
  if (/PLEN/i.test(orgao)) {
    latentSignals.push({
      domain: 'institutional',
      name: 'plenario_involvement',
      value: 1,
      payload: { orgao_julgador: raw.orgao_julgador },
    });
  }

  // sourceId = processo + '_' + cod_andamento (unique per decision row)
  const sourceId = `${raw.processo}_${raw.cod_andamento ?? raw.id}`;

  return {
    courtId: COURT_STF_ACRONYM,
    courtAcronym: COURT_STF_ACRONYM,
    externalNumber: raw.processo,
    organName: raw.orgao_julgador ?? null,
    proceduralClassName: classe,
    subject: safe(raw.assunto) ?? safe(raw.ramo_direito),

    decision: {
      date: safe(raw.data_decisao),
      kind: inferKind(raw.tipo_decisao),
      result: inferResult(raw.descricao_andamento, raw.subgrupo_andamento),
      fullText: null,
      excerpt: summary ? summary.slice(0, 500) : null,
      metadata: {
        incidente: raw.incidente,
        link_processo: raw.link_processo,
        cod_andamento: raw.cod_andamento,
        subgrupo_andamento: raw.subgrupo_andamento,
        descricao_andamento: raw.descricao_andamento,
        observacao_andamento: raw.observacao_andamento,
        grupo_origem: grupoOrigem,
        tipo_classe: raw.tipo_classe,
        ramo_direito: raw.ramo_direito,
        assunto_completo: raw.assunto_completo,
        indicador_colegiado: raw.indicador_colegiado,
        decisoes_virtual: raw.decisoes_virtual,
        preferencia_covid19: raw.preferencia_covid19,
        preferencia_criminal: raw.preferencia_criminal,
        sigla_ultimo_recurso: raw.sigla_ultimo_recurso,
        recurso_interno_pendente: raw.recurso_interno_pendente,
        ramo: inferRamo(classe, grupoOrigem),
        id_fato_decisao: raw.id_fato_decisao,
        raw_source: raw.raw_source,
        sem_apreciacao_merito: !hasMeritAppraisal(
          (raw.descricao_andamento ?? '').toLowerCase(),
        ),
      },
    },

    judges,
    environment,
    rapporteurOutcome: null,
    latentSignals,
    environmentEvents: [],

    sourceTable: 'stf_decisoes',
    sourceId,
    rawMetadata: { ...(raw as unknown as Record<string, unknown>) },
  };
}
