// court-registry.ts
// Barreira central de isolamento entre tribunais.
// Nenhum dado cruza fronteiras sem autorização explícita aqui.

export type CourtId = 'stj' | 'stf'; // adicionar novos tribunais APENAS aqui

export type CourtStatus = 'active' | 'sealed' | 'pending';
// active  — extração e normalização permitidas
// sealed  — sistema fechado, só leitura. comparação cross-court permitida apenas entre sealed
// pending — schema criado mas nenhuma operação autorizada ainda

export type LoadStrategy = 'full' | 'incremental' | 'on_demand' | 'pending_inspection';

export type DataContract = {
  inspectedAt: string | null;     // data em que o conteúdo real foi inspecionado
  fieldsValidated: string[];      // campos confirmados com conteúdo real
  estimatedSizePerRow: string;    // tamanho estimado por linha
  loadStrategy: LoadStrategy;
  notes: string;
};

export type CourtDefinition = {
  id: CourtId;
  name: string;
  sourceTable: string;       // tabela bruta exclusiva deste tribunal
  judxPrefix: string;        // prefixo de identificação nos logs
  status: CourtStatus;
  allowedSources: string[];  // únicas fontes de dados autorizadas para este tribunal
  pipelineModes: string[];   // modos de pipeline autorizados para este tribunal
  canCompareWith: CourtId[]; // só permite comparação se ambos os tribunais estiverem sealed
  dataContracts: Record<string, DataContract>; // keyed by source table name
};

export const COURT_REGISTRY: Record<CourtId, CourtDefinition> = {
  stj: {
    id: 'stj',
    name: 'Superior Tribunal de Justiça',
    sourceTable: 'stj_decisions',
    judxPrefix: 'STJ',
    status: 'active',
    allowedSources: ['stj_decisions', 'stj_decisoes_dj', 'stj_movimentacao', 'stj_integras'],
    pipelineModes: ['core', 'events', 'patterns', 'advanced'],
    canCompareWith: [],
    dataContracts: {
      stj_decisions: {
        inspectedAt: '2026-03-26',
        fieldsValidated: [
          'numero_registro', 'processo', 'classe', 'relator', 'orgao_julgador',
          'data_julgamento', 'ementa', 'resultado', 'ramo_direito',
        ],
        estimatedSizePerRow: '2.7 KB',
        loadStrategy: 'incremental',
        notes: 'tema 0.6%, uf 0% — campos vazios. ementa é o campo pesado (~2K chars). resultado contém tipo ("ACÓRDÃO"), não o desfecho.',
      },
      stj_decisoes_dj: {
        inspectedAt: '2026-03-26',
        fieldsValidated: [
          'numero_processo', 'classe', 'relator', 'orgao_julgador',
          'data_decisao', 'tipo_decisao', 'ementa',
        ],
        estimatedSizePerRow: '1.5 KB',
        loadStrategy: 'incremental',
        notes: 'Diário da Justiça. url_inteiro_teor presente em parte dos registros.',
      },
      stj_movimentacao: {
        inspectedAt: null,
        fieldsValidated: [],
        estimatedSizePerRow: '~160 bytes',
        loadStrategy: 'pending_inspection',
        notes: 'Carregado antes de inspeção. 573K rows / 89MB. descricao 0%, ambiente 0%. tipo_movimentacao é código CNJ numérico sem lookup. Precisa de auditoria de valor real vs custo de armazenamento.',
      },
      stj_integras: {
        inspectedAt: null,
        fieldsValidated: [],
        estimatedSizePerRow: 'desconhecido',
        loadStrategy: 'pending_inspection',
        notes: 'Nunca carregado. 1841 resources CKAN. ZIPs com TXT inteiro teor + metadados JSON. Potencial alto mas custo de storage desconhecido.',
      },
    },
  },
  stf: {
    id: 'stf',
    name: 'Supremo Tribunal Federal',
    sourceTable: 'stf_decisions',
    judxPrefix: 'STF',
    status: 'active',
    allowedSources: ['stf_decisions'],
    pipelineModes: ['core'],
    canCompareWith: [],
    dataContracts: {
      stf_decisions: {
        inspectedAt: '2026-03-26',
        fieldsValidated: [
          'processo', 'relator_atual', 'ambiente_julgamento', 'orgao_julgador',
          'data_decisao', 'tipo_decisao', 'andamento_decisao', 'assuntos_processo',
          'ramo_direito', 'ano_decisao', 'observacao_andamento',
        ],
        estimatedSizePerRow: '700 bytes',
        loadStrategy: 'incremental',
        notes: 'Todos os campos 100% preenchidos. ambiente_julgamento é estruturado (Presencial/Virtual). observacao_andamento contém texto de decisão ou *NI*.',
      },
    },
  },
};

// Barreira 1 — verifica se tribunal existe e está autorizado para operar
export function assertCourtActive(courtId: string): CourtDefinition {
  const court = COURT_REGISTRY[courtId as CourtId];
  if (!court) throw new Error(`Tribunal desconhecido: ${courtId}. Apenas tribunais registrados em COURT_REGISTRY são permitidos.`);
  if (court.status === 'pending') throw new Error(`Tribunal ${courtId} está com status PENDING — nenhuma operação autorizada até o adaptador ser criado e validado.`);
  if (court.status === 'sealed') throw new Error(`Tribunal ${courtId} está SEALED — apenas leitura permitida.`);
  return court;
}

// Barreira 2 — verifica se a fonte de dados é autorizada para este tribunal
export function assertSourceAllowed(courtId: CourtId, source: string): void {
  const court = COURT_REGISTRY[courtId];
  if (!court.allowedSources.includes(source)) {
    throw new Error(`Fonte '${source}' não autorizada para tribunal ${courtId}. Fontes permitidas: ${court.allowedSources.join(', ')}`);
  }
}

// Barreira 3 — verifica se modo de pipeline é autorizado para este tribunal
export function assertModeAllowed(courtId: CourtId, mode: string): void {
  const court = COURT_REGISTRY[courtId];
  if (!court.pipelineModes.includes(mode)) {
    throw new Error(`Modo '${mode}' não autorizado para tribunal ${courtId}. Modos permitidos: ${court.pipelineModes.join(', ')}`);
  }
}

// Barreira 4 — verifica se comparação cross-court é permitida
export function assertComparisonAllowed(courtA: CourtId, courtB: CourtId): void {
  const a = COURT_REGISTRY[courtA];
  const b = COURT_REGISTRY[courtB];
  if (a.status !== 'sealed') throw new Error(`Comparação bloqueada: ${courtA} ainda não está SEALED.`);
  if (b.status !== 'sealed') throw new Error(`Comparação bloqueada: ${courtB} ainda não está SEALED.`);
  if (!a.canCompareWith.includes(courtB)) throw new Error(`Comparação entre ${courtA} e ${courtB} não autorizada no registry.`);
}

// Barreira 5 — verifica se fonte foi inspecionada antes de permitir carga
export function assertSourceInspected(source: string): DataContract {
  for (const court of Object.values(COURT_REGISTRY)) {
    const contract = court.dataContracts[source];
    if (contract) {
      if (contract.loadStrategy === 'pending_inspection') {
        throw new Error(
          `Fonte '${source}' não foi inspecionada. Rode inspectSource('${source}') antes de qualquer carga. ` +
          `Notas: ${contract.notes}`,
        );
      }
      return contract;
    }
  }
  throw new Error(`Fonte '${source}' não possui dataContract em nenhum tribunal do COURT_REGISTRY.`);
}

// Utilitário — lista tribunais por status
export function getCourtsByStatus(status: CourtStatus): CourtDefinition[] {
  return Object.values(COURT_REGISTRY).filter(c => c.status === status);
}

// Utilitário — resolve CourtId a partir de source table
export function resolveCourtFromSource(source: string): CourtDefinition | null {
  return Object.values(COURT_REGISTRY).find(c => c.allowedSources.includes(source)) ?? null;
}

// Utilitário — retorna o dataContract de uma fonte
export function getDataContract(source: string): DataContract | null {
  for (const court of Object.values(COURT_REGISTRY)) {
    if (court.dataContracts[source]) return court.dataContracts[source];
  }
  return null;
}
