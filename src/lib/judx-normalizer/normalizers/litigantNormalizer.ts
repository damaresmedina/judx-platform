// judx-normalizer — Litigant normalizer
// Heuristic detection of litigants from ementa/metadata.

import type { JudxBundle } from '../shared/types';
import { logInfo, logInference } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxLitigantInsert = {
  name: string;
  normalized_name: string;
  state_entity: boolean;
  entity_type: string | null;
};

// ---------------------------------------------------------------------------
// Known state entities and patterns
// ---------------------------------------------------------------------------

type StateEntityDef = {
  pattern: RegExp;
  name: string;
  entityType: string;
};

const STATE_ENTITIES: StateEntityDef[] = [
  { pattern: /\bUni[aã]o\s+Federal\b|\bUni[aã]o\b/i, name: 'União Federal', entityType: 'federal' },
  { pattern: /\bINSS\b/i, name: 'INSS', entityType: 'autarquia_federal' },
  { pattern: /\bFazenda\s+Nacional\b/i, name: 'Fazenda Nacional', entityType: 'federal' },
  { pattern: /\bFazenda\s+P[uú]blica\b/i, name: 'Fazenda Pública', entityType: 'fazenda' },
  { pattern: /\bIBAMA\b/i, name: 'IBAMA', entityType: 'autarquia_federal' },
  { pattern: /\bANATEL\b/i, name: 'ANATEL', entityType: 'agencia_reguladora' },
  { pattern: /\bReceita\s+Federal\b/i, name: 'Receita Federal', entityType: 'federal' },
  { pattern: /\bBanco\s+Central\b|\bBACEN\b/i, name: 'Banco Central', entityType: 'autarquia_federal' },
  { pattern: /\bEstado\s+d[eoa]\s+\w+/i, name: 'Estado', entityType: 'estadual' },
  { pattern: /\bMunic[ií]pio\s+d[eoa]\s+\w+/i, name: 'Município', entityType: 'municipal' },
  { pattern: /\bDistrito\s+Federal\b/i, name: 'Distrito Federal', entityType: 'distrital' },
  { pattern: /\bANVISA\b/i, name: 'ANVISA', entityType: 'autarquia_federal' },
  { pattern: /\bANS\b/i, name: 'ANS', entityType: 'agencia_reguladora' },
  { pattern: /\bANEEL\b/i, name: 'ANEEL', entityType: 'agencia_reguladora' },
  { pattern: /\bCEF\b|\bCaixa\s+Econ[oô]mica/i, name: 'Caixa Econômica Federal', entityType: 'empresa_publica' },
  { pattern: /\bMinist[eé]rio\s+P[uú]blico\b|\bMP[FE]\b/i, name: 'Ministério Público', entityType: 'ministerio_publico' },
];

// ---------------------------------------------------------------------------
// Litigation profile inference
// ---------------------------------------------------------------------------

type ProfilePattern = {
  pattern: RegExp;
  profile: string;
};

const PROFILE_PATTERNS: ProfilePattern[] = [
  { pattern: /\btribut[aá]ri[oa]\b|\bICMS\b|\bISS\b|\bIPI\b|\bimpost[oa]\b|\bcontribui[cç][aã]o/i, profile: 'tributaria' },
  { pattern: /\bfiscal\b|\bexecu[cç][aã]o\s+fiscal\b|\bd[ií]vida\s+ativa/i, profile: 'fiscal' },
  { pattern: /\bprevidenci[aá]ri[oa]\b|\baposentadoria\b|\bbenef[ií]cio\b|\bINSS\b/i, profile: 'previdenciaria' },
  { pattern: /\badministrativ[oa]\b|\bservidor\s+p[uú]blico\b|\blicita[cç][aã]o\b|\bato\s+administrativo/i, profile: 'administrativa' },
];

function inferLitigationProfile(text: string): string | null {
  for (const { pattern, profile } of PROFILE_PATTERNS) {
    if (pattern.test(text)) {
      return profile;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * Heuristically detects litigants from the bundle's ementa and metadata.
 * Identifies government entities and infers a litigation profile.
 *
 * @param bundle - The normalized JudxBundle.
 * @returns Object with litigants array, stateInvolved flag, and profile.
 */
export function normalizeLitigants(bundle: JudxBundle): {
  litigants: JudxLitigantInsert[];
  stateInvolved: boolean;
  stateLitigationProfile: string | null;
} {
  // Build a combined text corpus for scanning
  const textParts: string[] = [];
  if (bundle.decision.excerpt) textParts.push(bundle.decision.excerpt);
  if (bundle.decision.fullText) textParts.push(bundle.decision.fullText);

  // Also scan rawMetadata string values
  for (const val of Object.values(bundle.rawMetadata)) {
    if (typeof val === 'string') textParts.push(val);
  }

  const corpus = textParts.join(' ');

  if (corpus.trim().length === 0) {
    return { litigants: [], stateInvolved: false, stateLitigationProfile: null };
  }

  const litigants: JudxLitigantInsert[] = [];
  const seenNames = new Set<string>();

  for (const entity of STATE_ENTITIES) {
    const match = entity.pattern.exec(corpus);
    if (match) {
      const matchedText = match[0];
      const normalizedName = entity.name;

      // Deduplicate by normalized name
      if (seenNames.has(normalizedName)) continue;
      seenNames.add(normalizedName);

      litigants.push({
        name: matchedText,
        normalized_name: normalizedName,
        state_entity: true,
        entity_type: entity.entityType,
      });

      logInference(
        'litigantNormalizer',
        'state_entity',
        normalizedName,
        'heuristic',
        0.7,
        { matchedText, entityType: entity.entityType },
      );
    }
  }

  const stateInvolved = litigants.length > 0;
  const stateLitigationProfile = stateInvolved ? inferLitigationProfile(corpus) : null;

  if (stateLitigationProfile) {
    logInference(
      'litigantNormalizer',
      'litigation_profile',
      stateLitigationProfile,
      'heuristic',
      0.65,
      { stateEntitiesFound: litigants.map((l) => l.normalized_name) },
    );
  }

  logInfo('litigantNormalizer', `Found ${litigants.length} litigant(s)`, {
    stateInvolved,
    stateLitigationProfile,
    externalNumber: bundle.externalNumber,
  });

  return { litigants, stateInvolved, stateLitigationProfile };
}
