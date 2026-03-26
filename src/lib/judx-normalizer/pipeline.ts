// judx-normalizer — Main normalization pipeline
// Reads from raw STJ tables and populates judx_* normalized tables.
//
// Structural rules enforced:
//   1. No data without context — court_id is always resolved first
//   2. No isolated decision — every decision is linked to a case
//   3. Environment is central — always attempt inference
//   4. Allow pre-taxonomic registration — unknown patterns are registered as-is

import type {
  StjDecisionRaw,
  StjDecisaoDjRaw,
  JudxBundle,
  NormalizationResult,
} from './shared/types';
import { getJudxClient } from './shared/db';
import { BATCH_SIZE, COURT_STJ_ACRONYM, PIPELINE_VERSION } from './shared/constants';
import { logInfo, logWarn, logError, logInference } from './shared/logger';
import { slugify, normalizeJudgeName, normalizeOrganName, normalizeClassName, cleanText } from './shared/text';
import { parseDate } from './shared/dates';
import { isNonEmpty } from './shared/guards';
import { recordSignature } from './shared/hashes';
import { type PipelineMode, isLayerActive } from './shared/pipeline-mode';

// Adapters
import { readStjDecisions, adaptStjDecision } from './adapters/stjDecisionsAdapter';
import { readStjDecisoesDj, adaptStjDecisaoDj } from './adapters/stjDecisoesDjAdapter';

// Writers
import { upsertCourt } from './writers/upsertCourt';
import { upsertOrgan } from './writers/upsertOrgan';
import { upsertProceduralClass } from './writers/upsertProceduralClass';
import { upsertSubject } from './writers/upsertSubject';
import { upsertCase } from './writers/upsertCase';
import { upsertEcology } from './writers/upsertEcology';
import { upsertLitigant } from './writers/upsertLitigant';
import { upsertInferenceAudit } from './writers/upsertInferenceAudit';

const CTX = 'pipeline';

// ---------------------------------------------------------------------------
// Internal writer helpers (for tables without dedicated writer files)
// ---------------------------------------------------------------------------

async function upsertDecision(
  caseId: string,
  bundle: JudxBundle,
): Promise<string | null> {
  const client = getJudxClient();

  const decidedAt = parseDate(bundle.decision.date);

  const row: Record<string, unknown> = {
    case_id: caseId,
    decision_date: decidedAt,
    decision_kind: bundle.decision.kind,
    result: bundle.decision.result,
    full_text: bundle.decision.fullText ?? null,
    excerpt: bundle.decision.excerpt ?? null,
    environment: bundle.environment.inferred,
    environment_confidence: bundle.environment.confidence,
    environment_source: bundle.environment.source,
    environment_evidence: bundle.environment.evidence,
    source_table: bundle.sourceTable,
    source_id: bundle.sourceId,
    metadata: bundle.decision.metadata,
    content_hash: recordSignature([
      bundle.sourceTable,
      bundle.sourceId,
      bundle.decision.excerpt,
      bundle.decision.result,
    ]),
  };

  try {
    const { data, error } = await client
      .from('judx_decision')
      .upsert(row, { onConflict: 'case_id,content_hash' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `upsertDecision failed: ${error.message}`, { caseId, sourceId: bundle.sourceId });
      return null;
    }

    return data?.id as string;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertDecision exception: ${msg}`, { caseId });
    return null;
  }
}

async function upsertJudge(
  name: string,
  courtId: string,
): Promise<string | null> {
  const client = getJudxClient();
  const normalizedName = normalizeJudgeName(name);

  const row: Record<string, unknown> = {
    name: normalizedName,
    normalized_name: slugify(normalizedName),
    court_id: courtId,
  };

  try {
    const { data, error } = await client
      .from('judx_judge')
      .upsert(row, { onConflict: 'court_id,normalized_name' })
      .select('id')
      .single();

    if (error) {
      logError(CTX, `upsertJudge failed: ${error.message}`, { name });
      return null;
    }

    return data?.id as string;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertJudge exception: ${msg}`, { name });
    return null;
  }
}

async function upsertJudgePosition(
  caseId: string,
  decisionId: string,
  judgeId: string,
  judge: JudxBundle['judges'][number],
): Promise<void> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: caseId,
    decision_id: decisionId,
    judge_id: judgeId,
    role: judge.role,
    vote_type: judge.voteType,
    is_relator: judge.isRelator,
    is_relator_para_acordao: judge.isRelatorParaAcordao,
    relator_prevailed: judge.relatorPrevailed,
    relator_defeated_marker: judge.relatorDefeatedMarker,
  };

  try {
    const { error } = await client
      .from('judx_judge_position')
      .upsert(row, { onConflict: 'decision_id,judge_id' })
      .select('id');

    if (error) {
      logError(CTX, `upsertJudgePosition failed: ${error.message}`, { caseId, judgeId });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertJudgePosition exception: ${msg}`, { caseId, judgeId });
  }
}

async function upsertJudgmentRegime(
  caseId: string,
  bundle: JudxBundle,
): Promise<void> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: caseId,
    environment: bundle.environment.inferred,
    environment_confidence: bundle.environment.confidence,
    environment_source: bundle.environment.source,
    environment_evidence: bundle.environment.evidence,
    decision_date: parseDate(bundle.decision.date),
  };

  try {
    const { error } = await client
      .from('judx_judgment_regime')
      .upsert(row, { onConflict: 'case_id' })
      .select('id');

    if (error) {
      logError(CTX, `upsertJudgmentRegime failed: ${error.message}`, { caseId });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertJudgmentRegime exception: ${msg}`, { caseId });
  }
}

async function upsertEnvironmentEvent(
  caseId: string,
  event: JudxBundle['environmentEvents'][number],
): Promise<void> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: caseId,
    event_type: event.eventType,
    to_environment: event.toEnvironment,
    evidence: event.evidence,
  };

  try {
    const { error } = await client
      .from('judx_environment_event')
      .upsert(row, { onConflict: 'case_id,event_type,to_environment' })
      .select('id');

    if (error) {
      logError(CTX, `upsertEnvironmentEvent failed: ${error.message}`, { caseId });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertEnvironmentEvent exception: ${msg}`, { caseId });
  }
}

async function upsertEnvironmentInference(
  caseId: string,
  bundle: JudxBundle,
): Promise<void> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: caseId,
    inferred_value: bundle.environment.inferred,
    source: bundle.environment.source,
    confidence: bundle.environment.confidence,
    evidence: bundle.environment.evidence,
    pipeline_version: PIPELINE_VERSION,
  };

  try {
    const { error } = await client
      .from('judx_environment_inference')
      .upsert(row, { onConflict: 'case_id,pipeline_version' })
      .select('id');

    if (error) {
      logError(CTX, `upsertEnvironmentInference failed: ${error.message}`, { caseId });
      return;
    }

    // Audit trail
    await upsertInferenceAudit({
      hypothesis: `ambiente inferido como ${bundle.environment.inferred} a partir de ${bundle.environment.source}`,
      empirical_base: bundle.environment.evidence,
      textual_evidence: bundle.environment.evidence,
      counter_evidence: bundle.environment.confidence < 0.85 ? 'confiança abaixo do limiar primário' : null,
      limitation: bundle.environment.source !== 'structured_field' ? 'inferência textual — sem campo estruturado na fonte' : null,
      plausible_alternative: null,
      rule_applied: null,
      pipeline_layer: 'events',
      confidence_score: bundle.environment.confidence,
      source_table: bundle.sourceTable,
      source_id: bundle.sourceId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertEnvironmentInference exception: ${msg}`, { caseId });
  }
}

async function upsertRapporteurOutcome(
  caseId: string,
  decisionId: string,
  outcome: NonNullable<JudxBundle['rapporteurOutcome']>,
  bundle: JudxBundle,
): Promise<void> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: caseId,
    decision_id: decisionId,
    relator_name: outcome.relatorName,
    outcome: outcome.outcome,
    substitute_name: outcome.substituteName,
    evidence: outcome.evidence,
    confidence: outcome.confidence,
  };

  try {
    const { error } = await client
      .from('judx_rapporteur_outcome')
      .upsert(row, { onConflict: 'decision_id' })
      .select('id');

    if (error) {
      logError(CTX, `upsertRapporteurOutcome failed: ${error.message}`, { caseId, decisionId });
      return;
    }

    // Audit trail
    const plausibleAlt = outcome.outcome === 'vencido' ? 'prevaleceu'
      : outcome.outcome === 'prevaleceu' ? 'vencido'
      : null;

    await upsertInferenceAudit({
      hypothesis: `relator ${outcome.outcome} — detectado por padrão textual`,
      empirical_base: outcome.evidence,
      textual_evidence: outcome.evidence,
      counter_evidence: outcome.confidence <= 0.90 ? 'padrão de baixa especificidade' : null,
      limitation: null,
      plausible_alternative: plausibleAlt,
      rule_applied: null,
      pipeline_layer: 'events',
      confidence_score: outcome.confidence,
      source_table: bundle.sourceTable,
      source_id: bundle.sourceId,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertRapporteurOutcome exception: ${msg}`, { caseId });
  }
}

async function upsertCaseLitigants(
  caseId: string,
  litigantId: string,
  role: string,
): Promise<void> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: caseId,
    litigant_id: litigantId,
    role,
  };

  try {
    const { error } = await client
      .from('judx_case_litigant')
      .upsert(row, { onConflict: 'case_id,litigant_id,role' })
      .select('id');

    if (error) {
      logError(CTX, `upsertCaseLitigants failed: ${error.message}`, { caseId, litigantId });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertCaseLitigants exception: ${msg}`, { caseId });
  }
}

async function upsertLatentSignal(
  caseId: string,
  signal: JudxBundle['latentSignals'][number],
): Promise<void> {
  const client = getJudxClient();

  const row: Record<string, unknown> = {
    case_id: caseId,
    domain: signal.domain,
    name: signal.name,
    value: signal.value,
    payload: signal.payload,
    pipeline_version: PIPELINE_VERSION,
  };

  try {
    const { error } = await client
      .from('judx_latent_signal')
      .upsert(row, { onConflict: 'case_id,domain,name' })
      .select('id');

    if (error) {
      logError(CTX, `upsertLatentSignal failed: ${error.message}`, { caseId, signal: signal.name });
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `upsertLatentSignal exception: ${msg}`, { caseId });
  }
}

// ---------------------------------------------------------------------------
// Single bundle processor
// ---------------------------------------------------------------------------

/**
 * Processes a single JudxBundle through the full write sequence.
 * Returns true if the record was successfully upserted (at least case + decision).
 */
async function processBundle(
  bundle: JudxBundle,
  courtId: string,
  result: NormalizationResult,
  mode: PipelineMode,
): Promise<boolean> {
  // --- Rule 1: No data without context (court_id guaranteed by caller) ---

  // Step 1: Upsert organ (if present)
  let organId: string | null = null;
  if (isNonEmpty(bundle.organName)) {
    const normalized = normalizeOrganName(bundle.organName!);
    organId = await upsertOrgan(courtId, bundle.organName!, slugify(normalized), null);
  }

  // Step 2: Upsert procedural class (if present)
  let classId: string | null = null;
  if (isNonEmpty(bundle.proceduralClassName)) {
    const normalized = normalizeClassName(bundle.proceduralClassName!);
    classId = await upsertProceduralClass(courtId, bundle.proceduralClassName!, slugify(normalized));
  }

  // Step 3: Upsert subject (if present — Rule 4: allow pre-taxonomic registration)
  let subjectId: string | null = null;
  if (isNonEmpty(bundle.subject)) {
    const normalized = cleanText(bundle.subject);
    subjectId = await upsertSubject(bundle.subject!, slugify(normalized));
  }

  // Step 4: Upsert case (Rule 2: every decision MUST be linked to a case)
  const stateInvolved = bundle.latentSignals.some(
    (s) => s.domain === 'parties' && s.name === 'state_involvement',
  );

  const caseId = await upsertCase({
    external_number: bundle.externalNumber,
    court_id: courtId,
    organ_id: organId,
    procedural_class_id: classId,
    main_subject_id: subjectId,
    phase: 'outra',
    decided_at: parseDate(bundle.decision.date),
    state_involved: stateInvolved,
    summary: bundle.decision.excerpt ? bundle.decision.excerpt.slice(0, 500) : null,
    metadata: bundle.rawMetadata,
  });

  if (!caseId) {
    logError(CTX, `Failed to upsert case — skipping record`, {
      sourceId: bundle.sourceId,
      sourceTable: bundle.sourceTable,
    });
    return false;
  }

  // Step 5: Upsert decision (Rule 2: no isolated decision)
  const decisionId = await upsertDecision(caseId, bundle);
  if (!decisionId) {
    logError(CTX, `Failed to upsert decision — partial record`, {
      caseId,
      sourceId: bundle.sourceId,
    });
    return false;
  }

  // Step 6: Upsert judges and their positions
  for (const judge of bundle.judges) {
    const judgeId = await upsertJudge(judge.name, courtId);
    if (judgeId) {
      await upsertJudgePosition(caseId, decisionId, judgeId, judge);
    }
  }

  // --- Events layer ---
  if (isLayerActive('judgment_regime', mode)) {
    // Step 7: Upsert judgment regime (Rule 3: environment is central)
    await upsertJudgmentRegime(caseId, bundle);

    // Step 8: Upsert environment events
    for (const event of bundle.environmentEvents) {
      await upsertEnvironmentEvent(caseId, event);
    }

    // Step 9: Upsert environment inference (Rule 3: always record the inference)
    if (bundle.environment.inferred !== 'nao_informado' || bundle.environment.confidence > 0) {
      await upsertEnvironmentInference(caseId, bundle);
      result.inferences++;

      logInference(
        CTX,
        'environment',
        bundle.environment.inferred,
        bundle.environment.source,
        bundle.environment.confidence,
        { caseId, sourceId: bundle.sourceId },
      );
    }

    // Step 10: Upsert rapporteur outcome (if detected)
    if (bundle.rapporteurOutcome) {
      await upsertRapporteurOutcome(caseId, decisionId, bundle.rapporteurOutcome, bundle);
    }
  }

  // --- Patterns layer ---
  if (isLayerActive('latent_signal', mode)) {
    // Step 11: Upsert latent signals (Rule 4: register unknown patterns)
    for (const signal of bundle.latentSignals) {
      await upsertLatentSignal(caseId, signal);
    }
  }

  // Note: Litigants are not extracted from the current STJ source tables
  // (they don't carry party information). The upsertLitigant + upsertCaseLitigants
  // steps are ready for future sources that include party data.

  return true;
}

// ---------------------------------------------------------------------------
// Source processing helpers
// ---------------------------------------------------------------------------

async function processStjDecisions(
  courtId: string,
  batchSize: number,
  limit: number,
  dryRun: boolean,
  result: NormalizationResult,
  mode: PipelineMode,
): Promise<void> {
  logInfo(CTX, `Processing source: stj_decisions (batchSize=${batchSize}, limit=${limit}, dryRun=${dryRun})`);

  let totalRead = 0;

  for await (const batch of readStjDecisions(batchSize)) {
    const effectiveBatch = limit > 0
      ? batch.slice(0, Math.max(0, limit - totalRead))
      : batch;

    if (effectiveBatch.length === 0) break;

    logInfo(CTX, `stj_decisions batch: ${effectiveBatch.length} records (offset=${totalRead})`);

    for (const raw of effectiveBatch) {
      result.processed++;
      try {
        const bundle = adaptStjDecision(raw);

        if (dryRun) {
          logInfo(CTX, `[DRY RUN] Would process: ${bundle.externalNumber}`, {
            environment: bundle.environment.inferred,
            judges: bundle.judges.length,
            signals: bundle.latentSignals.length,
          });
          continue;
        }

        const ok = await processBundle(bundle, courtId, result, mode);
        if (ok) {
          result.upserted++;
        } else {
          result.errors++;
        }
      } catch (err: unknown) {
        result.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logError(CTX, `Error processing stj_decisions record`, {
          sourceId: raw.numero_registro,
          error: msg,
        });
      }
    }

    totalRead += effectiveBatch.length;

    if (limit > 0 && totalRead >= limit) {
      logInfo(CTX, `Reached limit of ${limit} records for stj_decisions`);
      break;
    }
  }

  logInfo(CTX, `Finished stj_decisions: read=${totalRead}`);
}

async function processStjDecisoesDj(
  courtId: string,
  batchSize: number,
  limit: number,
  dryRun: boolean,
  result: NormalizationResult,
  mode: PipelineMode,
): Promise<void> {
  logInfo(CTX, `Processing source: stj_decisoes_dj (batchSize=${batchSize}, limit=${limit}, dryRun=${dryRun})`);

  let totalRead = 0;

  for await (const batch of readStjDecisoesDj(batchSize)) {
    const effectiveBatch = limit > 0
      ? batch.slice(0, Math.max(0, limit - totalRead))
      : batch;

    if (effectiveBatch.length === 0) break;

    logInfo(CTX, `stj_decisoes_dj batch: ${effectiveBatch.length} records (offset=${totalRead})`);

    for (const raw of effectiveBatch) {
      result.processed++;
      try {
        const bundle = adaptStjDecisaoDj(raw);

        if (dryRun) {
          logInfo(CTX, `[DRY RUN] Would process: ${bundle.externalNumber}`, {
            environment: bundle.environment.inferred,
            judges: bundle.judges.length,
            signals: bundle.latentSignals.length,
          });
          continue;
        }

        const ok = await processBundle(bundle, courtId, result, mode);
        if (ok) {
          result.upserted++;
        } else {
          result.errors++;
        }
      } catch (err: unknown) {
        result.errors++;
        const msg = err instanceof Error ? err.message : String(err);
        logError(CTX, `Error processing stj_decisoes_dj record`, {
          sourceId: String(raw.id),
          error: msg,
        });
      }
    }

    totalRead += effectiveBatch.length;

    if (limit > 0 && totalRead >= limit) {
      logInfo(CTX, `Reached limit of ${limit} records for stj_decisoes_dj`);
      break;
    }
  }

  logInfo(CTX, `Finished stj_decisoes_dj: read=${totalRead}`);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Runs the full normalization pipeline.
 *
 * Reads from raw STJ source tables, adapts each record to a JudxBundle,
 * and writes all normalized entities to the judx_* tables in the correct
 * dependency order.
 *
 * @param options.source   Which source table(s) to process. Default: 'all'
 * @param options.batchSize Number of rows to read per batch. Default: 200
 * @param options.limit    Max records to process per source (0 = unlimited). Default: 0
 * @param options.dryRun   If true, adapts and logs but does not write. Default: false
 */
export async function runNormalizationPipeline(options?: {
  source?: 'stj_decisions' | 'stj_decisoes_dj' | 'all';
  batchSize?: number;
  limit?: number;
  dryRun?: boolean;
  mode?: PipelineMode;
}): Promise<NormalizationResult> {
  const source = options?.source ?? 'all';
  const batchSize = options?.batchSize ?? BATCH_SIZE;
  const limit = options?.limit ?? 0;
  const dryRun = options?.dryRun ?? false;
  const mode: PipelineMode = options?.mode ?? 'core';

  const result: NormalizationResult = {
    processed: 0,
    upserted: 0,
    errors: 0,
    inferences: 0,
  };

  logInfo(CTX, '=== Normalization pipeline started ===', {
    source,
    batchSize,
    limit,
    dryRun,
    mode,
    pipelineVersion: PIPELINE_VERSION,
  });

  const startTime = Date.now();

  try {
    // -----------------------------------------------------------------
    // Step 1: Ensure court exists (Rule 1: no data without context)
    // -----------------------------------------------------------------
    logInfo(CTX, `Step 1: Ensuring court ${COURT_STJ_ACRONYM} exists`);
    const courtId = await upsertCourt(COURT_STJ_ACRONYM);
    logInfo(CTX, `Court resolved: ${COURT_STJ_ACRONYM} -> ${courtId}`);

    // -----------------------------------------------------------------
    // Step 2 + 3: Read from source tables and process batches
    // -----------------------------------------------------------------
    if (source === 'stj_decisions' || source === 'all') {
      await processStjDecisions(courtId, batchSize, limit, dryRun, result, mode);
    }

    if (source === 'stj_decisoes_dj' || source === 'all') {
      await processStjDecisoesDj(courtId, batchSize, limit, dryRun, result, mode);
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logError(CTX, `Pipeline fatal error: ${msg}`);
    // Don't rethrow — return partial results with error count
    result.errors++;
  }

  // -----------------------------------------------------------------
  // Step 4: Log final summary
  // -----------------------------------------------------------------
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  logInfo(CTX, '=== Normalization pipeline finished ===', {
    processed: result.processed,
    upserted: result.upserted,
    errors: result.errors,
    inferences: result.inferences,
    elapsedSeconds: elapsed,
    pipelineVersion: PIPELINE_VERSION,
  });

  if (result.errors > 0) {
    logWarn(CTX, `Pipeline completed with ${result.errors} error(s). Review logs above for details.`);
  }

  return result;
}
