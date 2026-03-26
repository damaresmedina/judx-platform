// Writer exclusivo STF — partes e advogados de stf_incidente_raw
// Nunca misturar com writers STJ

import { getJudxClient } from '../shared/db';
import { logError, logInfo, logWarn } from '../shared/logger';
import { parseStfPartes, type ParsedParte, type StfPartesParseResult } from '../parsers/stfPartesParser';
import { upsertLitigant } from './upsertLitigant';
import { upsertInferenceAudit } from './upsertInferenceAudit';
import { COURT_STF_ACRONYM } from '../shared/constants';

const CTX = 'upsertStfPartes';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeName(name: string): string {
  return name
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/[.\-,]/g, '')
    .trim();
}

function isStateEntity(name: string): boolean {
  return /\b(?:UNIAO|UNIÃO|ESTADO|MUNIC[IÍ]PIO|DISTRITO FEDERAL|INSS|IBAMA|ANVISA|INCRA|FUNAI|autarquia|empresa p[uú]blica)\b/i.test(name);
}

// ---------------------------------------------------------------------------
// Main upsert function
// ---------------------------------------------------------------------------

export type UpsertStfPartesResult = {
  incidente: number;
  litigants_upserted: number;
  case_litigants_upserted: number;
  counsel_inserted: number;
  errors: number;
};

/**
 * Processes a single stf_incidente_raw abaPartes record:
 * 1. Parses the HTML via parseStfPartes
 * 2. Upserts litigants (polo_ativo/polo_passivo) into judx_litigant + judx_case_litigant
 * 3. Inserts advogados into judx_counsel
 * 4. Records inference audit trail
 */
export async function upsertStfPartes(
  caseId: string,
  courtId: string,
  incidente: number,
  html: string,
): Promise<UpsertStfPartesResult> {
  const client = getJudxClient();
  const result: UpsertStfPartesResult = {
    incidente,
    litigants_upserted: 0,
    case_litigants_upserted: 0,
    counsel_inserted: 0,
    errors: 0,
  };

  const parsed = parseStfPartes(html);

  if (parsed.partes.length === 0) {
    logWarn(CTX, `No parties found for incidente ${incidente}`);
    return result;
  }

  logInfo(CTX, `Parsed ${parsed.raw_count} parties for incidente ${incidente}`, {
    polo_ativo: parsed.polo_ativo.length,
    polo_passivo: parsed.polo_passivo.length,
    advogados: parsed.advogados.length,
    outros: parsed.outros.length,
  });

  // --- Upsert litigants (polo_ativo + polo_passivo) ---
  const poloPartes = [...parsed.polo_ativo, ...parsed.polo_passivo];
  for (const parte of poloPartes) {
    try {
      const normalizedName = normalizeName(parte.nome);
      const litigantId = await upsertLitigant({
        name: parte.nome,
        normalizedName,
        litigantType: parte.role === 'polo_ativo' ? 'autor' : 'reu',
        stateEntity: isStateEntity(parte.nome),
        stateEntityKind: isStateEntity(parte.nome) ? 'detectado_por_heuristica' : undefined,
      });

      if (!litigantId) {
        result.errors++;
        continue;
      }
      result.litigants_upserted++;

      // Link to case via judx_case_litigant
      const proceduralPosition = parte.role === 'polo_ativo' ? 'polo_ativo' : 'polo_passivo';
      const { error: linkError } = await client
        .from('judx_case_litigant')
        .upsert(
          {
            case_id: caseId,
            litigant_id: litigantId,
            procedural_position: proceduralPosition,
            is_state_side: isStateEntity(parte.nome),
          },
          { onConflict: 'case_id,litigant_id,procedural_position' },
        );

      if (linkError) {
        logError(CTX, `judx_case_litigant upsert failed: ${linkError.message}`, {
          caseId, litigantId, proceduralPosition,
        });
        result.errors++;
      } else {
        result.case_litigants_upserted++;
      }
    } catch (err: unknown) {
      result.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      logError(CTX, `Error upserting litigant: ${msg}`, { nome: parte.nome });
    }
  }

  // --- Insert advogados into judx_counsel (append-only) ---
  for (const adv of parsed.advogados) {
    try {
      const oabParts = adv.oab?.split('/');
      const { error } = await client.from('judx_counsel').insert({
        case_id: caseId,
        court_id: courtId,
        nome: adv.nome,
        oab_numero: oabParts?.[0] ?? null,
        oab_seccional: oabParts?.[1] ?? null,
        polo: adv.role,
        confidence: adv.confidence,
        evidence: adv.evidence,
        source_table: 'stf_incidente_raw',
        source_id: String(incidente),
      });

      if (error) {
        logError(CTX, `judx_counsel insert failed: ${error.message}`, { nome: adv.nome });
        result.errors++;
      } else {
        result.counsel_inserted++;
      }
    } catch (err: unknown) {
      result.errors++;
      const msg = err instanceof Error ? err.message : String(err);
      logError(CTX, `Error inserting counsel: ${msg}`, { nome: adv.nome });
    }
  }

  // --- Audit trail ---
  await upsertInferenceAudit({
    hypothesis: `Extraídas ${parsed.raw_count} partes de abaPartes (incidente ${incidente}): ${parsed.polo_ativo.length} polo_ativo, ${parsed.polo_passivo.length} polo_passivo, ${parsed.advogados.length} advogados`,
    empirical_base: `HTML de stf_incidente_raw.aba='abaPartes' incidente=${incidente}`,
    textual_evidence: parsed.partes.slice(0, 3).map(p => `${p.papel}: ${p.nome}`).join('; '),
    counter_evidence: parsed.outros.length > 0
      ? `${parsed.outros.length} partes com papel não classificado`
      : null,
    limitation: 'Parser baseado em regex sobre HTML do portal STF — mudanças no layout podem quebrar extração',
    plausible_alternative: null,
    rule_applied: 'stfPartesParser polo classification',
    pipeline_layer: 'events',
    confidence_score: parsed.confidence,
    source_table: 'stf_incidente_raw',
    source_id: String(incidente),
  });

  logInfo(CTX, `Finished incidente ${incidente}: ${result.litigants_upserted} litigants, ${result.counsel_inserted} counsel, ${result.errors} errors`);
  return result;
}

// ---------------------------------------------------------------------------
// Batch processor — reads from stf_incidente_raw
// ---------------------------------------------------------------------------

/**
 * Processes all abaPartes records from stf_incidente_raw.
 * Requires a mapping from incidente -> caseId.
 */
export async function processStfPartesFromRaw(
  courtId: string,
  incidenteToCaseId: Map<number, string>,
): Promise<{ processed: number; errors: number }> {
  const client = getJudxClient();
  let processed = 0;
  let errors = 0;

  const { data, error } = await client
    .from('stf_incidente_raw')
    .select('incidente, html')
    .eq('aba', 'abaPartes');

  if (error) {
    logError(CTX, `Failed to read stf_incidente_raw: ${error.message}`);
    return { processed: 0, errors: 1 };
  }

  for (const row of data ?? []) {
    const caseId = incidenteToCaseId.get(row.incidente);
    if (!caseId) {
      logWarn(CTX, `No caseId mapping for incidente ${row.incidente}, skipping`);
      continue;
    }

    const result = await upsertStfPartes(caseId, courtId, row.incidente, row.html);
    processed++;
    errors += result.errors;
  }

  return { processed, errors };
}
