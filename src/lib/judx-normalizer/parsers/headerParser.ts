// judx-normalizer — headerParser
// Parses the header area of a court decision text to extract organ, environment,
// session type, and rapporteur information.

export type HeaderInfo = {
  organName: string | null;
  environment: string | null;
  environmentEvidence: string | null;
  sessionType: string | null;
  rapporteurName: string | null;
  rapporteurParaAcordao: string | null;
  rawHeader: string;
};

// ---------------------------------------------------------------------------
// Patterns
// ---------------------------------------------------------------------------

const ORGAN_PATTERNS: RegExp[] = [
  /PRIMEIRA\s+TURMA/i,
  /SEGUNDA\s+TURMA/i,
  /TERCEIRA\s+TURMA/i,
  /QUARTA\s+TURMA/i,
  /QUINTA\s+TURMA/i,
  /SEXTA\s+TURMA/i,
  /PRIMEIRA\s+SE[CÇ][AÃ]O/i,
  /SEGUNDA\s+SE[CÇ][AÃ]O/i,
  /TERCEIRA\s+SE[CÇ][AÃ]O/i,
  /CORTE\s+ESPECIAL/i,
  /PLEN[AÁ]RIO/i,
  /TURMA\s+RECURSAL/i,
  /[OÓ]RG[AÃ]O\s+ESPECIAL/i,
];

const ENVIRONMENT_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /Plen[aá]rio\s+Virtual|PV/i, value: 'virtual' },
  { pattern: /Turma\s+Virtual|TV/i, value: 'virtual' },
  { pattern: /Sess[aã]o\s+Virtual/i, value: 'virtual' },
  { pattern: /Sess[aã]o\s+Presencial/i, value: 'presencial' },
  { pattern: /Julgamento\s+Presencial/i, value: 'presencial' },
  { pattern: /H[ií]brido/i, value: 'hibrido' },
];

const SESSION_TYPE_PATTERNS: Array<{ pattern: RegExp; value: string }> = [
  { pattern: /Sess[aã]o\s+Ordin[aá]ria/i, value: 'ordinaria' },
  { pattern: /Sess[aã]o\s+Extraordin[aá]ria/i, value: 'extraordinaria' },
  { pattern: /Julgamento\s+Virtual/i, value: 'virtual' },
  { pattern: /Sess[aã]o\s+Virtual/i, value: 'virtual' },
];

const RELATOR_PATTERN =
  /Relator(?:a)?\s*(?:\(a\))?\s*:\s*(?:Ministro|Ministra|Min\.|Exmo(?:\(a\))?\.?\s*Sr(?:\(a\))?\.?)?\s*(.+)/i;

const RELATOR_PARA_ACORDAO_PATTERN =
  /Relator(?:a)?\s+para\s+o?\s*[Aa]córdão\s*:\s*(?:Ministro|Ministra|Min\.|Exmo(?:\(a\))?\.?\s*Sr(?:\(a\))?\.?)?\s*(.+)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractHeaderLines(text: string, maxLines = 15): string {
  return text
    .split(/\r?\n/)
    .slice(0, maxLines)
    .join('\n');
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[0].trim();
  }
  return null;
}

function extractRapporteurName(text: string, pattern: RegExp): string | null {
  const m = text.match(pattern);
  if (!m || !m[1]) return null;
  return m[1]
    .replace(/\s*[-–—]\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseHeader(
  fullText: string | null,
  ementa: string | null,
): HeaderInfo {
  const result: HeaderInfo = {
    organName: null,
    environment: null,
    environmentEvidence: null,
    sessionType: null,
    rapporteurName: null,
    rapporteurParaAcordao: null,
    rawHeader: '',
  };

  // Determine the text to work with — prefer fullText header, fall back to ementa
  const sourceText = fullText
    ? extractHeaderLines(fullText)
    : ementa
      ? extractHeaderLines(ementa)
      : '';

  if (!sourceText) return result;

  result.rawHeader = sourceText;

  // --- Organ ---
  result.organName = firstMatch(sourceText, ORGAN_PATTERNS);

  // --- Environment ---
  for (const { pattern, value } of ENVIRONMENT_PATTERNS) {
    const m = sourceText.match(pattern);
    if (m) {
      result.environment = value;
      result.environmentEvidence = m[0];
      break;
    }
  }

  // --- Session type ---
  for (const { pattern, value } of SESSION_TYPE_PATTERNS) {
    if (pattern.test(sourceText)) {
      result.sessionType = value;
      break;
    }
  }

  // --- Rapporteur para Acórdão (check first, since it's more specific) ---
  result.rapporteurParaAcordao = extractRapporteurName(
    sourceText,
    RELATOR_PARA_ACORDAO_PATTERN,
  );

  // --- Rapporteur ---
  // We need the plain Relator line. To avoid matching the "para Acórdão" line,
  // iterate line-by-line and pick the first "Relator:" that is NOT "para Acórdão".
  const lines = sourceText.split(/\r?\n/);
  for (const line of lines) {
    if (RELATOR_PARA_ACORDAO_PATTERN.test(line)) continue;
    const name = extractRapporteurName(line, RELATOR_PATTERN);
    if (name) {
      result.rapporteurName = name;
      break;
    }
  }

  return result;
}
