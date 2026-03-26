// stfPartesParser.ts
// Parser exclusivo STF — extrai partes e advogados do HTML de abaPartes
// Nunca misturar com parsers STJ

export type ParteRole =
  | 'polo_ativo'
  | 'polo_passivo'
  | 'advogado_ativo'
  | 'advogado_passivo'
  | 'outro';

export type ParsedParte = {
  nome: string;
  papel: string;           // valor bruto: REQTE.(S), ADV.(A/S), etc.
  role: ParteRole;         // classificação normalizada
  oab: string | null;      // extraído do nome do advogado se presente
  confidence: number;
  evidence: string;        // fragmento HTML que gerou a inferência
};

export type StfPartesParseResult = {
  partes: ParsedParte[];
  polo_ativo: ParsedParte[];
  polo_passivo: ParsedParte[];
  advogados: ParsedParte[];
  outros: ParsedParte[];
  raw_count: number;
  confidence: number;      // média das confidências
};

// ---------------------------------------------------------------------------
// Polo classification maps
// ---------------------------------------------------------------------------

const POLO_ATIVO_PATTERNS = [
  'REQTE', 'IMPTE', 'RECTE', 'PACTE', 'AUTOR', 'APTE', 'EMBTE',
  'SUSCTE', 'EXEQTE', 'AGRTE',
];

const POLO_PASSIVO_PATTERNS = [
  'REQDO', 'IMPDO', 'RECDO', 'PACDO', 'RÉU', 'REU', 'APDO', 'EMBDO',
  'SUSCDO', 'EXEQDO', 'AGRDO',
];

const ADV_PATTERN = /^ADV/i;

/**
 * Classifies a raw papel string into a ParteRole.
 * Returns [role, confidence].
 */
function classifyPapel(
  papel: string,
  lastPoloRole: 'polo_ativo' | 'polo_passivo' | null,
): [ParteRole, number] {
  const normalized = papel
    .toUpperCase()
    .replace(/[.\(\)\/]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Check advogado first — it depends on the preceding polo
  if (ADV_PATTERN.test(normalized)) {
    if (lastPoloRole === 'polo_ativo') return ['advogado_ativo', 0.95];
    if (lastPoloRole === 'polo_passivo') return ['advogado_passivo', 0.95];
    // No preceding polo context — cannot determine side
    return ['outro', 0.50];
  }

  // Exact prefix match for polo ativo
  for (const prefix of POLO_ATIVO_PATTERNS) {
    if (normalized.startsWith(prefix)) return ['polo_ativo', 0.95];
  }

  // Exact prefix match for polo passivo
  for (const prefix of POLO_PASSIVO_PATTERNS) {
    if (normalized.startsWith(prefix)) return ['polo_passivo', 0.95];
  }

  // Partial/substring match (lower confidence)
  const lc = normalized.toLowerCase();
  if (/requerente|impetrante|recorrente|autor|apelante|embargante|paciente/.test(lc))
    return ['polo_ativo', 0.70];
  if (/requerido|impetrado|recorrido|r[eé]u|apelado|embargado/.test(lc))
    return ['polo_passivo', 0.70];
  if (/advogad|defensor|procurador/.test(lc))
    return [lastPoloRole === 'polo_passivo' ? 'advogado_passivo' : 'advogado_ativo', 0.70];

  // Amicus, assistente, terceiro, etc.
  return ['outro', 0.50];
}

// ---------------------------------------------------------------------------
// OAB extraction
// ---------------------------------------------------------------------------

const OAB_REGEX = /\((\d{3,7})\/([A-Z]{2})\)/;

/**
 * Extracts OAB number and state from an advogado name string.
 * Returns "NNNNNN/UF" or null.
 */
function extractOab(name: string): string | null {
  const m = name.match(OAB_REGEX);
  if (m) return `${m[1]}/${m[2]}`;
  return null;
}

// ---------------------------------------------------------------------------
// HTML parser
// ---------------------------------------------------------------------------

const BLOCK_REGEX =
  /<div class="processo-partes lista-dados[^"]*">\s*<div class="detalhe-parte">([\s\S]*?)<\/div>\s*<div class="nome-parte">([\s\S]*?)<\/div>\s*<\/div>/gi;

/**
 * Parses the raw HTML from `abaPartes` and returns structured parties.
 * Uses only the `#todas-partes` section (full list, not the summary).
 */
export function parseStfPartes(html: string): StfPartesParseResult {
  const partes: ParsedParte[] = [];
  let lastPoloRole: 'polo_ativo' | 'polo_passivo' | null = null;

  let match: RegExpExecArray | null;
  while ((match = BLOCK_REGEX.exec(html)) !== null) {
    const papel = match[1].replace(/<[^>]*>/g, '').trim();
    const nome = match[2].replace(/<[^>]*>/g, '').replace(/&nbsp;?/g, '').trim();

    if (!nome || nome === 'SEM REPRESENTAÇÃO NOS AUTOS') continue;

    const [role, confidence] = classifyPapel(papel, lastPoloRole);

    // Track last polo for advogado context inference
    if (role === 'polo_ativo' || role === 'polo_passivo') {
      lastPoloRole = role;
    }

    const oab = (role === 'advogado_ativo' || role === 'advogado_passivo')
      ? extractOab(nome)
      : null;

    partes.push({
      nome,
      papel,
      role,
      oab,
      confidence,
      evidence: match[0].substring(0, 200),
    });
  }

  // Reset regex lastIndex
  BLOCK_REGEX.lastIndex = 0;

  const polo_ativo = partes.filter(p => p.role === 'polo_ativo');
  const polo_passivo = partes.filter(p => p.role === 'polo_passivo');
  const advogados = partes.filter(p => p.role === 'advogado_ativo' || p.role === 'advogado_passivo');
  const outros = partes.filter(p => p.role === 'outro');

  const avgConfidence = partes.length > 0
    ? partes.reduce((sum, p) => sum + p.confidence, 0) / partes.length
    : 0;

  return {
    partes,
    polo_ativo,
    polo_passivo,
    advogados,
    outros,
    raw_count: partes.length,
    confidence: Math.round(avgConfidence * 100) / 100,
  };
}
