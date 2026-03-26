// court-registry.ts
// Barreira central de isolamento entre tribunais.
// Nenhum dado cruza fronteiras sem autorização explícita aqui.

export type CourtId = 'stj' | 'stf'; // adicionar novos tribunais APENAS aqui

export type CourtStatus = 'active' | 'sealed' | 'pending';
// active  — extração e normalização permitidas
// sealed  — sistema fechado, só leitura. comparação cross-court permitida apenas entre sealed
// pending — schema criado mas nenhuma operação autorizada ainda

export type CourtDefinition = {
  id: CourtId;
  name: string;
  sourceTable: string;       // tabela bruta exclusiva deste tribunal
  judxPrefix: string;        // prefixo de identificação nos logs
  status: CourtStatus;
  allowedSources: string[];  // únicas fontes de dados autorizadas para este tribunal
  pipelineModes: string[];   // modos de pipeline autorizados para este tribunal
  canCompareWith: CourtId[]; // só permite comparação se ambos os tribunais estiverem sealed
};

export const COURT_REGISTRY: Record<CourtId, CourtDefinition> = {
  stj: {
    id: 'stj',
    name: 'Superior Tribunal de Justiça',
    sourceTable: 'stj_decisions',
    judxPrefix: 'STJ',
    status: 'active',
    allowedSources: ['stj_decisions', 'stj_decisoes_dj'],
    pipelineModes: ['core', 'events', 'patterns', 'advanced'],
    canCompareWith: [], // STJ só compara com STF quando ambos estiverem sealed
  },
  stf: {
    id: 'stf',
    name: 'Supremo Tribunal Federal',
    sourceTable: 'stf_decisions',
    judxPrefix: 'STF',
    status: 'active', // adaptador criado em stfDecisionsAdapter.ts
    allowedSources: ['stf_decisions'],
    pipelineModes: ['core'], // só core autorizado por enquanto
    canCompareWith: [],
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

// Utilitário — lista tribunais por status
export function getCourtsByStatus(status: CourtStatus): CourtDefinition[] {
  return Object.values(COURT_REGISTRY).filter(c => c.status === status);
}

// Utilitário — resolve CourtId a partir de source table
export function resolveCourtFromSource(source: string): CourtDefinition | null {
  return Object.values(COURT_REGISTRY).find(c => c.allowedSources.includes(source)) ?? null;
}
