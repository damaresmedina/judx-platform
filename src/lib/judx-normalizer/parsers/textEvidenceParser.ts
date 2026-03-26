// judx-normalizer — textEvidenceParser
// Extracts and preserves text evidence (fragments, positions, environment events)
// to support traceability of every inference.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TextEvidence = {
  fragment: string;
  position: number;
  pattern: string;
  fullMatch: string;
};

export type EnvironmentEventParsed = {
  eventType: string;
  toEnvironment: string;
  evidence: string;
  confidence: number;
};

// ---------------------------------------------------------------------------
// Environment event patterns
// ---------------------------------------------------------------------------

type EventDef = {
  pattern: RegExp;
  eventType: string;
  toEnvironment: string;
  confidence: number;
};

const ENVIRONMENT_EVENT_PATTERNS: EventDef[] = [
  {
    pattern: /pedido\s+de\s+destaque/i,
    eventType: 'destaque_solicitado',
    toEnvironment: 'presencial',
    confidence: 0.90,
  },
  {
    pattern: /destaque\s+deferido/i,
    eventType: 'destaque_deferido',
    toEnvironment: 'presencial',
    confidence: 0.92,
  },
  {
    pattern: /destaque\s+concedido/i,
    eventType: 'destaque_deferido',
    toEnvironment: 'presencial',
    confidence: 0.92,
  },
  {
    pattern: /\bdestaque\b(?!\s+(?:de|do|da|para|no|na))/i,
    eventType: 'destaque',
    toEnvironment: 'presencial',
    confidence: 0.78,
  },
  {
    pattern: /retirada\s+de\s+pauta/i,
    eventType: 'retirada_pauta',
    toEnvironment: 'nao_informado',
    confidence: 0.70,
  },
  {
    pattern: /reinclu[sí](?:da|do|[aã]o)\s+(?:em|na|no)\s+pauta/i,
    eventType: 'reinclusao_pauta',
    toEnvironment: 'nao_informado',
    confidence: 0.70,
  },
  {
    pattern: /sess[aã]o\s+convertida\s+(?:em|para)\s+(?:presencial|f[ií]sic)/i,
    eventType: 'conversao_presencial',
    toEnvironment: 'presencial',
    confidence: 0.93,
  },
  {
    pattern: /sess[aã]o\s+convertida\s+(?:em|para)\s+virtual/i,
    eventType: 'conversao_virtual',
    toEnvironment: 'virtual',
    confidence: 0.93,
  },
  {
    pattern: /oralidade\s+ativada/i,
    eventType: 'oralidade_ativada',
    toEnvironment: 'presencial',
    confidence: 0.85,
  },
  {
    pattern: /sustenta[cç][aã]o\s+oral/i,
    eventType: 'sustentacao_oral',
    toEnvironment: 'presencial',
    confidence: 0.80,
  },
  {
    pattern: /julgamento\s+(?:transferido|remetido)\s+(?:ao|para\s+o?)\s+plen[aá]rio\s+f[ií]sico/i,
    eventType: 'transferencia_presencial',
    toEnvironment: 'presencial',
    confidence: 0.92,
  },
  {
    pattern: /julgamento\s+(?:transferido|remetido)\s+(?:ao|para\s+o?)\s+plen[aá]rio\s+virtual/i,
    eventType: 'transferencia_virtual',
    toEnvironment: 'virtual',
    confidence: 0.92,
  },
];

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

/**
 * Finds the first match of `pattern` in `text` and returns a TextEvidence
 * record with surrounding context.
 *
 * @param text         The text to search.
 * @param pattern      The RegExp to match.
 * @param contextChars Number of characters of context on each side (default 100).
 */
export function extractEvidence(
  text: string,
  pattern: RegExp,
  contextChars = 100,
): TextEvidence | null {
  if (!text) return null;

  const m = text.match(pattern);
  if (!m || m.index === undefined) return null;

  const start = Math.max(0, m.index - contextChars);
  const end = Math.min(text.length, m.index + m[0].length + contextChars);
  const fragment = text.slice(start, end).replace(/\s+/g, ' ').trim();

  return {
    fragment,
    position: m.index,
    pattern: pattern.source,
    fullMatch: m[0],
  };
}

/**
 * Scans `text` against an array of labeled patterns and returns all matches.
 */
export function extractAllMatches(
  text: string,
  patterns: Array<{ pattern: RegExp; label: string }>,
): TextEvidence[] {
  if (!text) return [];

  const results: TextEvidence[] = [];
  for (const { pattern, label } of patterns) {
    // Use a global regex to find all occurrences
    const globalRe = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    let m: RegExpExecArray | null;
    while ((m = globalRe.exec(text)) !== null) {
      const start = Math.max(0, m.index - 100);
      const end = Math.min(text.length, m.index + m[0].length + 100);
      const fragment = text.slice(start, end).replace(/\s+/g, ' ').trim();

      results.push({
        fragment,
        position: m.index,
        pattern: label,
        fullMatch: m[0],
      });

      // Prevent infinite loop for zero-length matches
      if (m[0].length === 0) globalRe.lastIndex++;
    }
  }

  // Sort by position
  results.sort((a, b) => a.position - b.position);
  return results;
}

/**
 * Scans fullText and ementa for environment transition events (destaque,
 * retirada de pauta, conversão, oralidade, etc.).
 */
export function extractEnvironmentEvents(
  fullText: string | null,
  ementa: string | null,
): EnvironmentEventParsed[] {
  const events: EnvironmentEventParsed[] = [];
  const seen = new Set<string>();

  const sources: string[] = [];
  if (fullText) sources.push(fullText);
  if (ementa) sources.push(ementa);

  for (const text of sources) {
    for (const def of ENVIRONMENT_EVENT_PATTERNS) {
      const globalRe = new RegExp(
        def.pattern.source,
        def.pattern.flags.includes('g') ? def.pattern.flags : def.pattern.flags + 'g',
      );

      let m: RegExpExecArray | null;
      while ((m = globalRe.exec(text)) !== null) {
        // Deduplicate by eventType + approximate position
        const key = `${def.eventType}:${Math.floor(m.index / 200)}`;
        if (seen.has(key)) {
          if (m[0].length === 0) globalRe.lastIndex++;
          continue;
        }
        seen.add(key);

        const start = Math.max(0, m.index - 80);
        const end = Math.min(text.length, m.index + m[0].length + 80);
        const evidence = text.slice(start, end).replace(/\s+/g, ' ').trim();

        events.push({
          eventType: def.eventType,
          toEnvironment: def.toEnvironment,
          evidence,
          confidence: def.confidence,
        });

        if (m[0].length === 0) globalRe.lastIndex++;
      }
    }
  }

  return events;
}
