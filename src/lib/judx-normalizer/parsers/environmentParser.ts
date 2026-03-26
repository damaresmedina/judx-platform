// judx-normalizer — environmentParser
// Detects the judgment environment (virtual / presencial / hibrido / nao_informado)
// using a multi-source precedence strategy with conflict detection.

import {
  ENVIRONMENT_PATTERNS,
  DEFAULT_ENVIRONMENT,
} from '../shared/constants';
import type { ConfidenceSource } from '../shared/confidence';
import { confidenceForSource } from '../shared/confidence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EnvironmentInference = {
  value: string;
  source: ConfidenceSource;
  confidence: number;
  evidence: string | null;
  conflicts: Array<{ value: string; source: string; evidence: string }>;
};

type SourceMatch = {
  value: string;
  source: ConfidenceSource;
  confidence: number;
  evidence: string;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Compile ENVIRONMENT_PATTERNS keys into RegExp objects (cached once). */
const compiledPatterns: Array<{
  regex: RegExp;
  value: string;
  confidence: number;
}> = Object.entries(ENVIRONMENT_PATTERNS).map(([src, cfg]) => ({
  regex: new RegExp(src, 'i'),
  value: cfg.value,
  confidence: cfg.confidence,
}));

function scanText(
  text: string,
  source: ConfidenceSource,
): SourceMatch[] {
  const matches: SourceMatch[] = [];
  for (const { regex, value, confidence } of compiledPatterns) {
    const m = text.match(regex);
    if (m) {
      // Combine pattern confidence with source confidence
      const combined = Math.min(confidence, confidenceForSource(source));
      matches.push({
        value,
        source,
        confidence: combined,
        evidence: m[0],
      });
    }
  }
  return matches;
}

function extractHeaderLines(text: string, maxLines = 15): string {
  return text.split(/\r?\n/).slice(0, maxLines).join('\n');
}

function extractFirstLines(text: string, maxLines = 5): string {
  return text.split(/\r?\n/).slice(0, maxLines).join('\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Determines the judgment environment by scanning multiple sources in
 * precedence order.  Conflicts between sources are tracked and reported.
 *
 * Precedence:
 *   1. `structuredField` (explicit metadata value)
 *   2. Header of `fullText` (first 15 lines)
 *   3. First lines of `ementa`
 *   4. Body of `fullText` (everything beyond the header)
 *   5. Heuristic fallback
 */
export function parseEnvironment(
  structuredField: string | null,
  fullText: string | null,
  ementa: string | null,
): EnvironmentInference {
  const allMatches: SourceMatch[] = [];

  // --- 1. Structured field ---
  if (structuredField && structuredField.trim()) {
    const normalized = structuredField.trim().toLowerCase();
    const knownValues = ['virtual', 'presencial', 'hibrido'];
    const matched = knownValues.find((v) => normalized.includes(v));
    if (matched) {
      allMatches.push({
        value: matched,
        source: 'structured_field',
        confidence: confidenceForSource('structured_field'),
        evidence: structuredField.trim(),
      });
    } else {
      // Structured field exists but is not a known value — scan it as text
      allMatches.push(...scanText(structuredField, 'structured_field'));
    }
  }

  // --- 2. Header of fullText ---
  if (fullText) {
    const header = extractHeaderLines(fullText);
    allMatches.push(...scanText(header, 'header'));
  }

  // --- 3. First lines of ementa ---
  if (ementa) {
    const first = extractFirstLines(ementa);
    allMatches.push(...scanText(first, 'ementa_first_lines'));
  }

  // --- 4. Body of fullText (after header) ---
  if (fullText) {
    const lines = fullText.split(/\r?\n/);
    const body = lines.slice(15).join('\n');
    if (body.trim()) {
      allMatches.push(...scanText(body, 'body_text'));
    }
  }

  // --- Select winner (highest-precedence match) ---
  // Precedence is encoded by the order we pushed to allMatches — first wins.
  const winner: SourceMatch | undefined = allMatches[0];

  // --- Detect conflicts ---
  const conflicts: Array<{ value: string; source: string; evidence: string }> = [];
  if (winner) {
    for (const m of allMatches.slice(1)) {
      if (m.value !== winner.value) {
        conflicts.push({
          value: m.value,
          source: m.source,
          evidence: m.evidence,
        });
      }
    }
  }

  if (winner) {
    return {
      value: winner.value,
      source: winner.source,
      confidence: winner.confidence,
      evidence: winner.evidence,
      conflicts,
    };
  }

  // --- 5. Heuristic fallback ---
  return {
    value: DEFAULT_ENVIRONMENT,
    source: 'heuristic',
    confidence: confidenceForSource('heuristic'),
    evidence: null,
    conflicts: [],
  };
}
