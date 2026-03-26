// judx-normalizer — organParser
// Normalizes the judging organ/body name and classifies its type.

import type { ConfidenceSource } from '../shared/confidence';
import { confidenceForSource } from '../shared/confidence';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type OrganParseResult = {
  normalizedName: string | null;
  organType: string | null;
  source: ConfidenceSource;
  confidence: number;
};

// ---------------------------------------------------------------------------
// Known organ patterns (for extraction from fullText)
// ---------------------------------------------------------------------------

type OrganDef = {
  pattern: RegExp;
  normalized: string;
  type: string;
};

const KNOWN_ORGANS: OrganDef[] = [
  { pattern: /PRIMEIRA\s+TURMA/i, normalized: 'Primeira Turma', type: 'turma' },
  { pattern: /SEGUNDA\s+TURMA/i, normalized: 'Segunda Turma', type: 'turma' },
  { pattern: /TERCEIRA\s+TURMA/i, normalized: 'Terceira Turma', type: 'turma' },
  { pattern: /QUARTA\s+TURMA/i, normalized: 'Quarta Turma', type: 'turma' },
  { pattern: /QUINTA\s+TURMA/i, normalized: 'Quinta Turma', type: 'turma' },
  { pattern: /SEXTA\s+TURMA/i, normalized: 'Sexta Turma', type: 'turma' },
  { pattern: /PRIMEIRA\s+SE[CÇ][AÃ]O/i, normalized: 'Primeira Seção', type: 'secao' },
  { pattern: /SEGUNDA\s+SE[CÇ][AÃ]O/i, normalized: 'Segunda Seção', type: 'secao' },
  { pattern: /TERCEIRA\s+SE[CÇ][AÃ]O/i, normalized: 'Terceira Seção', type: 'secao' },
  { pattern: /CORTE\s+ESPECIAL/i, normalized: 'Corte Especial', type: 'corte_especial' },
  { pattern: /PLEN[AÁ]RIO/i, normalized: 'Plenário', type: 'plenario' },
  { pattern: /[OÓ]RG[AÃ]O\s+ESPECIAL/i, normalized: 'Órgão Especial', type: 'corte_especial' },
  { pattern: /TURMA\s+RECURSAL/i, normalized: 'Turma Recursal', type: 'turma' },
];

// ---------------------------------------------------------------------------
// Known abbreviation map
// ---------------------------------------------------------------------------

const ABBREVIATION_MAP: Record<string, { normalized: string; type: string }> = {
  't1': { normalized: 'Primeira Turma', type: 'turma' },
  't2': { normalized: 'Segunda Turma', type: 'turma' },
  't3': { normalized: 'Terceira Turma', type: 'turma' },
  't4': { normalized: 'Quarta Turma', type: 'turma' },
  't5': { normalized: 'Quinta Turma', type: 'turma' },
  't6': { normalized: 'Sexta Turma', type: 'turma' },
  's1': { normalized: 'Primeira Seção', type: 'secao' },
  's2': { normalized: 'Segunda Seção', type: 'secao' },
  's3': { normalized: 'Terceira Seção', type: 'secao' },
  'ce': { normalized: 'Corte Especial', type: 'corte_especial' },
  'corte especial': { normalized: 'Corte Especial', type: 'corte_especial' },
  'plenario': { normalized: 'Plenário', type: 'plenario' },
  'plenário': { normalized: 'Plenário', type: 'plenario' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toTitleCase(str: string): string {
  const lowerWords = new Set(['de', 'do', 'da', 'dos', 'das', 'e', 'para', 'o', 'a']);
  return str
    .trim()
    .split(/\s+/)
    .map((word, idx) => {
      const lower = word.toLowerCase();
      if (idx > 0 && lowerWords.has(lower)) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

function matchKnownOrgan(text: string): { normalized: string; type: string } | null {
  for (const def of KNOWN_ORGANS) {
    if (def.pattern.test(text)) {
      return { normalized: def.normalized, type: def.type };
    }
  }
  return null;
}

function extractHeaderLines(text: string, maxLines = 15): string {
  return text.split(/\r?\n/).slice(0, maxLines).join('\n');
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseOrgan(
  rawOrgan: string | null,
  fullText: string | null,
): OrganParseResult {
  // --- 1. Try rawOrgan (structured field) ---
  if (rawOrgan && rawOrgan.trim()) {
    const trimmed = rawOrgan.trim();

    // Check abbreviation map
    const abbr = ABBREVIATION_MAP[trimmed.toLowerCase()];
    if (abbr) {
      return {
        normalizedName: abbr.normalized,
        organType: abbr.type,
        source: 'structured_field',
        confidence: confidenceForSource('structured_field'),
      };
    }

    // Check known organ patterns against the raw value
    const known = matchKnownOrgan(trimmed);
    if (known) {
      return {
        normalizedName: known.normalized,
        organType: known.type,
        source: 'structured_field',
        confidence: confidenceForSource('structured_field'),
      };
    }

    // Not recognized but a value exists — title-case it and attempt type classification
    const normalized = toTitleCase(trimmed);
    const type = classifyOrganType(normalized);
    return {
      normalizedName: normalized,
      organType: type,
      source: 'structured_field',
      confidence: 0.80, // lower because we could not map to a known organ
    };
  }

  // --- 2. Try fullText header ---
  if (fullText) {
    const header = extractHeaderLines(fullText);
    const known = matchKnownOrgan(header);
    if (known) {
      return {
        normalizedName: known.normalized,
        organType: known.type,
        source: 'header',
        confidence: confidenceForSource('header'),
      };
    }
  }

  // --- 3. Nothing found ---
  return {
    normalizedName: null,
    organType: null,
    source: 'heuristic',
    confidence: 0,
  };
}

// ---------------------------------------------------------------------------
// Organ type classifier (fallback for unrecognized names)
// ---------------------------------------------------------------------------

function classifyOrganType(name: string): string | null {
  const lower = name.toLowerCase();
  if (/turma/i.test(lower)) return 'turma';
  if (/se[cç][aã]o/i.test(lower)) return 'secao';
  if (/corte\s+especial/i.test(lower)) return 'corte_especial';
  if (/[oó]rg[aã]o\s+especial/i.test(lower)) return 'corte_especial';
  if (/plen[aá]rio/i.test(lower)) return 'plenario';
  return null;
}
