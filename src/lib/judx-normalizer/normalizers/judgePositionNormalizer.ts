// judx-normalizer — Judge position normalizer
// Maps judges in a JudxBundle to judx_judge_positions rows.

import type { JudxBundle } from '../shared/types';
import { logInfo, logWarn } from '../shared/logger';

// ---------------------------------------------------------------------------
// Insert type
// ---------------------------------------------------------------------------

export type JudxJudgePositionInsert = {
  case_id: string;
  decision_id: string | null;
  judge_id: string;
  role: string;
  vote_type: string | null;
  authored_vote: boolean;
  leading_vote: boolean;
  relator_prevailed: boolean | null;
  relator_defeated_marker: string | null;
  metadata: Record<string, unknown>;
};

// ---------------------------------------------------------------------------
// Role mapping
// ---------------------------------------------------------------------------

const ROLE_MAP: Record<string, string> = {
  relator: 'relator',
  revisor: 'revisor',
  vogal: 'vogal',
  presidente: 'presidente',
};

function mapRole(raw: string): string {
  const key = raw.toLowerCase().trim();
  return ROLE_MAP[key] ?? 'vogal';
}

// ---------------------------------------------------------------------------
// Normalizer
// ---------------------------------------------------------------------------

/**
 * For each judge in the bundle, creates a position record.
 *
 * @param bundle     - The normalized JudxBundle.
 * @param caseId     - The UUID of the case.
 * @param decisionId - The UUID of the decision (may be null).
 * @param judgeIdMap - Map of normalized_name -> judge UUID (from prior upsert).
 * @returns Array of insert-ready objects for `judx_judge_positions`.
 */
export function normalizeJudgePosition(
  bundle: JudxBundle,
  caseId: string,
  decisionId: string | null,
  judgeIdMap: Map<string, string>,
): JudxJudgePositionInsert[] {
  const positions: JudxJudgePositionInsert[] = [];

  for (const judge of bundle.judges) {
    // Look up the judge UUID from the normalized name map.
    // We try the original name first, then a cleaned version.
    const normalizedKey = judge.name
      .replace(/\bMinistr[oa]\b\.?/gi, '')
      .replace(/\bMin\b\.?/gi, '')
      .replace(/\bDes\b\.?/gi, '')
      .replace(/\bDr\b\.?/gi, '')
      .trim()
      .replace(/\s+/g, ' ');

    // Find judge ID: try exact name, normalized key, or iterate the map
    let judgeId: string | undefined;
    for (const [mapKey, mapValue] of judgeIdMap.entries()) {
      if (
        mapKey === judge.name ||
        mapKey === normalizedKey ||
        mapKey.toLowerCase() === normalizedKey.toLowerCase()
      ) {
        judgeId = mapValue;
        break;
      }
    }

    if (!judgeId) {
      logWarn('judgePositionNormalizer', `Judge ID not found for "${judge.name}", skipping`, {
        caseId,
        availableKeys: Array.from(judgeIdMap.keys()),
      });
      continue;
    }

    // Determine role
    let role: string;
    const metadata: Record<string, unknown> = {};

    if (judge.isRelator) {
      role = 'relator';
    } else if (judge.isRelatorParaAcordao) {
      role = 'relator';
      metadata.relator_para_acordao = true;
      metadata.note = 'Relator para o Acórdão (substitui relator original)';
    } else {
      role = mapRole(judge.role);
    }

    const position: JudxJudgePositionInsert = {
      case_id: caseId,
      decision_id: decisionId,
      judge_id: judgeId,
      role,
      vote_type: judge.voteType || null,
      authored_vote: judge.isRelator || judge.isRelatorParaAcordao,
      leading_vote: judge.isRelator || judge.isRelatorParaAcordao,
      relator_prevailed: judge.relatorPrevailed,
      relator_defeated_marker: judge.relatorDefeatedMarker,
      metadata,
    };

    positions.push(position);
  }

  logInfo('judgePositionNormalizer', `Created ${positions.length} position(s) for case ${caseId}`, {
    decisionId,
    judgeCount: bundle.judges.length,
  });

  return positions;
}
