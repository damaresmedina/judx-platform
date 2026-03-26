// judx-normalizer — rapporteurParser
// Detects rapporteur (relator) outcomes: whether the relator prevailed, was
// defeated, or was substituted by a "Relator para Acórdão".

import { RAPPORTEUR_PATTERNS } from '../shared/constants';
import { confidenceForSource } from '../shared/confidence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RapporteurParseResult = {
  relatorName: string | null;
  isRelatorParaAcordao: boolean;
  relatorParaAcordaoName: string | null;
  relatorPrevailed: boolean | null;
  relatorDefeated: boolean;
  outcome:
    | 'prevaleceu'
    | 'vencido'
    | 'substituido_por_relator_acordao'
    | 'nao_identificado';
  confidence: number;
  evidence: string | null;
};

// ---------------------------------------------------------------------------
// Internal patterns
// ---------------------------------------------------------------------------

/**
 * Extracts the name that follows a "Relator(a) para (o) Acórdão:" marker.
 * Accepts optional "Ministro/a" or "Min." title.
 */
const RELATOR_ACORDAO_NAME_RE =
  /Relator(?:a)?\s+para\s+o?\s*[Aa]córdão\s*:\s*(?:Ministro|Ministra|Min\.)?\s*([^\n,;]+)/i;

/**
 * Extracts the relator name from a plain "Relator(a):" line.
 */
const RELATOR_NAME_RE =
  /Relator(?:a)?\s*(?:\(a\))?\s*:\s*(?:Ministro|Ministra|Min\.)?\s*([^\n,;]+)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractHeaderLines(text: string, maxLines = 15): string {
  return text.split(/\r?\n/).slice(0, maxLines).join('\n');
}

function cleanName(raw: string): string {
  return raw
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

type PatternHit = {
  outcome: string;
  confidence: number;
  evidence: string;
};

function scanForRapporteurPatterns(text: string): PatternHit | null {
  for (const { pattern, outcome, confidence } of RAPPORTEUR_PATTERNS) {
    const m = text.match(pattern);
    if (m) {
      // Capture surrounding context for evidence (up to 100 chars each side)
      const start = Math.max(0, m.index! - 60);
      const end = Math.min(text.length, m.index! + m[0].length + 60);
      const evidence = text.slice(start, end).replace(/\s+/g, ' ').trim();
      return { outcome, confidence, evidence };
    }
  }
  return null;
}

function extractRelatorAcordaoName(text: string): string | null {
  const m = text.match(RELATOR_ACORDAO_NAME_RE);
  if (!m || !m[1]) return null;
  return cleanName(m[1]);
}

function extractRelatorName(text: string): string | null {
  // Iterate line-by-line to avoid matching "Relator para Acórdão" lines
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    if (/Relator(?:a)?\s+para\s+o?\s*[Aa]córdão/i.test(line)) continue;
    const m = line.match(RELATOR_NAME_RE);
    if (m && m[1]) return cleanName(m[1]);
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseRapporteurOutcome(
  fullText: string | null,
  ementa: string | null,
  structuredRelator: string | null,
): RapporteurParseResult {
  const result: RapporteurParseResult = {
    relatorName: null,
    isRelatorParaAcordao: false,
    relatorParaAcordaoName: null,
    relatorPrevailed: null,
    relatorDefeated: false,
    outcome: 'nao_identificado',
    confidence: 0,
    evidence: null,
  };

  // --- Gather name from structured field if available ---
  if (structuredRelator && structuredRelator.trim()) {
    result.relatorName = cleanName(structuredRelator);
  }

  // --- Attempt to extract from fullText first ---
  const textsToScan: Array<{ text: string; source: string }> = [];

  if (fullText) {
    textsToScan.push({ text: extractHeaderLines(fullText), source: 'header' });
  }
  if (ementa) {
    textsToScan.push({ text: ementa, source: 'ementa' });
  }
  if (fullText) {
    // Body (beyond header)
    const body = fullText.split(/\r?\n/).slice(15).join('\n');
    if (body.trim()) {
      textsToScan.push({ text: body, source: 'body' });
    }
  }

  // --- Extract relator name from text if not yet found ---
  if (!result.relatorName) {
    for (const { text } of textsToScan) {
      const name = extractRelatorName(text);
      if (name) {
        result.relatorName = name;
        break;
      }
    }
  }

  // --- Extract relator para acórdão name ---
  for (const { text } of textsToScan) {
    const name = extractRelatorAcordaoName(text);
    if (name) {
      result.relatorParaAcordaoName = name;
      result.isRelatorParaAcordao = true;
      break;
    }
  }

  // --- Scan for rapporteur outcome patterns ---
  let bestHit: PatternHit | null = null;

  for (const { text } of textsToScan) {
    const hit = scanForRapporteurPatterns(text);
    if (hit) {
      bestHit = hit;
      break; // first source wins (header > ementa > body)
    }
  }

  if (bestHit) {
    result.outcome = bestHit.outcome as RapporteurParseResult['outcome'];
    result.confidence = bestHit.confidence;
    result.evidence = bestHit.evidence;

    if (
      result.outcome === 'vencido' ||
      result.outcome === 'substituido_por_relator_acordao'
    ) {
      result.relatorDefeated = true;
      result.relatorPrevailed = false;
    } else if (result.outcome === 'prevaleceu') {
      result.relatorPrevailed = true;
      result.relatorDefeated = false;
    }
  } else if (result.relatorParaAcordaoName) {
    // We found a "Relator para Acórdão" name but no explicit pattern hit —
    // the relator was substituted.
    result.outcome = 'substituido_por_relator_acordao';
    result.relatorDefeated = true;
    result.relatorPrevailed = false;
    result.confidence = 0.85;
    result.evidence = `Relator para Acórdão: ${result.relatorParaAcordaoName}`;
  } else if (result.relatorName) {
    // Relator exists but no defeat/substitution markers found —
    // default to "prevaleceu" with low confidence.
    result.outcome = 'prevaleceu';
    result.relatorPrevailed = true;
    result.relatorDefeated = false;
    result.confidence = 0.60;
    result.evidence = null;
  }

  return result;
}
