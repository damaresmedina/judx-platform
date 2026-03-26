// judx-normalizer — Bundle normalizer (main orchestrator)
// Coordinates all individual normalizers to produce a complete NormalizedEntities object.
// This module does NOT write to the database — it only prepares data for writers.

import type { JudxBundle } from '../shared/types';
import { normalizeJudgeName } from '../shared/text';
import { logInfo, logError } from '../shared/logger';
import { COURT_STJ_ACRONYM } from '../shared/constants';

import { normalizeCase, type JudxCaseInsert } from './caseNormalizer';
import { normalizeDecision, type JudxDecisionInsert } from './decisionNormalizer';
import { normalizeJudge, type JudxJudgeInsert } from './judgeNormalizer';
import { normalizeJudgePosition, type JudxJudgePositionInsert } from './judgePositionNormalizer';
import { normalizeEnvironment, type JudxJudgmentRegimeInsert, type JudxEnvironmentEventInsert } from './environmentNormalizer';
import { normalizeClass, type JudxProceduralClassInsert } from './classNormalizer';
import { normalizeOrgan, type JudxOrganInsert } from './organNormalizer';
import { normalizeSubject, type JudxSubjectInsert } from './subjectNormalizer';
import { normalizeLitigants, type JudxLitigantInsert } from './litigantNormalizer';
import { normalizeRapporteurOutcome, type JudxRapporteurOutcomeInsert } from './rapporteurOutcomeNormalizer';
import { normalizeLatentSignals, type JudxLatentSignalInsert } from './latentSignalNormalizer';

// ---------------------------------------------------------------------------
// NormalizedEntities — the output of the full normalization pipeline
// ---------------------------------------------------------------------------

export type NormalizedEntities = {
  courtAcronym: string;
  courtId: string;

  case: JudxCaseInsert;
  decision: JudxDecisionInsert;

  organ: JudxOrganInsert | null;
  proceduralClass: JudxProceduralClassInsert | null;
  subject: JudxSubjectInsert | null;

  judges: JudxJudgeInsert[];
  judgePositions: JudxJudgePositionInsert[];

  judgmentRegime: JudxJudgmentRegimeInsert;
  environmentEvents: JudxEnvironmentEventInsert[];

  rapporteurOutcome: JudxRapporteurOutcomeInsert | null;

  litigants: JudxLitigantInsert[];
  stateInvolved: boolean;
  stateLitigationProfile: string | null;

  latentSignals: JudxLatentSignalInsert[];
};

// ---------------------------------------------------------------------------
// Court resolution
// ---------------------------------------------------------------------------

/**
 * Hard-coded court IDs for known courts.
 * In production, these would be fetched from the database or a cache.
 * For now, the orchestrator accepts a resolver function.
 */
type CourtResolver = (acronym: string) => Promise<string>;

const DEFAULT_COURT_MAP: Record<string, string> = {
  // Placeholder — in production these come from the judx_courts table.
  // Writers should upsert the court first and inject the real UUID.
};

async function defaultCourtResolver(acronym: string): Promise<string> {
  const id = DEFAULT_COURT_MAP[acronym];
  if (!id) {
    throw new Error(
      `[bundleNormalizer] No court ID found for acronym "${acronym}". ` +
      `Ensure the court is registered in judx_courts before normalizing.`,
    );
  }
  return id;
}

// ---------------------------------------------------------------------------
// Main orchestrator
// ---------------------------------------------------------------------------

/**
 * Normalizes a complete JudxBundle into all entity shapes needed for DB insertion.
 * Does NOT write to the database — the returned NormalizedEntities are passed to writers.
 *
 * @param bundle        - The JudxBundle to normalize.
 * @param courtResolver - Optional function to resolve court acronym to UUID.
 *                        If not provided, uses a default map (which requires pre-registration).
 * @returns A Promise resolving to NormalizedEntities.
 */
export async function normalizeBundle(
  bundle: JudxBundle,
  courtResolver?: CourtResolver,
): Promise<NormalizedEntities> {
  const resolver = courtResolver ?? defaultCourtResolver;

  logInfo('bundleNormalizer', `Starting normalization for ${bundle.externalNumber}`, {
    court: bundle.courtAcronym,
    sourceTable: bundle.sourceTable,
    sourceId: bundle.sourceId,
  });

  // 1. Resolve court — use bundle.courtId directly when available
  const courtAcronym = bundle.courtAcronym || COURT_STJ_ACRONYM;
  const courtId = bundle.courtId || await resolver(courtAcronym);

  // 2. Normalize organ
  const organ = normalizeOrgan(bundle.organName, courtId);

  // 3. Normalize procedural class
  const proceduralClass = normalizeClass(bundle.proceduralClassName, courtId);

  // 4. Normalize subject
  const subject = normalizeSubject(bundle.subject);

  // 5. Normalize case (uses placeholder IDs — writers will fill real IDs after upsert)
  const caseInsert = normalizeCase(bundle, courtId);

  // Use a placeholder case ID for dependent entities.
  // Writers will replace this with the real UUID after upserting the case.
  const placeholderCaseId = `pending:${bundle.externalNumber}`;

  // 6. Normalize decision
  const decisionInsert = normalizeDecision(bundle, placeholderCaseId);

  // Placeholder decision ID for entities that depend on it
  const placeholderDecisionId = `pending:decision:${bundle.sourceId}`;

  // 7. Normalize judges
  const judges: JudxJudgeInsert[] = [];
  const judgeIdMap = new Map<string, string>();

  for (const judge of bundle.judges) {
    const judgeInsert = normalizeJudge(judge.name, courtId);
    judges.push(judgeInsert);

    // Use normalized_name as key; placeholder ID until writers upsert and get real UUIDs
    const placeholderJudgeId = `pending:judge:${judgeInsert.normalized_name}`;
    judgeIdMap.set(judgeInsert.normalized_name, placeholderJudgeId);
  }

  // 8. Normalize judge positions
  const judgePositions = normalizeJudgePosition(
    bundle,
    placeholderCaseId,
    placeholderDecisionId,
    judgeIdMap,
  );

  // 9. Normalize environment (regime + events)
  const { regime: judgmentRegime, events: environmentEvents } = normalizeEnvironment(
    bundle,
    placeholderCaseId,
  );

  // 10. Normalize rapporteur outcome
  const rapporteurOutcome = normalizeRapporteurOutcome(
    bundle,
    placeholderCaseId,
    placeholderDecisionId,
    judgeIdMap,
  );

  // 11. Normalize litigants
  const { litigants, stateInvolved, stateLitigationProfile } = normalizeLitigants(bundle);

  // 12. Normalize latent signals
  const latentSignals = normalizeLatentSignals(bundle, placeholderCaseId, placeholderDecisionId);

  logInfo('bundleNormalizer', `Normalization complete for ${bundle.externalNumber}`, {
    judges: judges.length,
    positions: judgePositions.length,
    signals: latentSignals.length,
    litigants: litigants.length,
    hasOrgan: organ !== null,
    hasClass: proceduralClass !== null,
    hasSubject: subject !== null,
    hasRapporteurOutcome: rapporteurOutcome !== null,
    stateInvolved,
  });

  return {
    courtAcronym,
    courtId,
    case: caseInsert,
    decision: decisionInsert,
    organ,
    proceduralClass,
    subject,
    judges,
    judgePositions,
    judgmentRegime,
    environmentEvents,
    rapporteurOutcome,
    litigants,
    stateInvolved,
    stateLitigationProfile,
    latentSignals,
  };
}
