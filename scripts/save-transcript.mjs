/**
 * save-transcript.mjs — Salva transcript da sessão em markdown
 *
 * Chamado automaticamente pelo hook SessionEnd em ~/.claude/settings.json.
 * Pode ser rodado manualmente: node scripts/save-transcript.mjs [transcript_path]
 *
 * Entrada:
 *   - stdin JSON com { session_id, transcript_path } (hook Claude Code)
 *   - OU argumento posicional com caminho do .jsonl
 *   - OU sem argumentos: pega o .jsonl mais recente em ~/.claude/projects/C--Users-medin/
 *
 * Saída: markdown em Desktop/backup_judx/resultados/transcripts/YYYY-MM-DD_HHMM_<sid>.md
 */

import { readFileSync, writeFileSync, readdirSync, statSync, mkdirSync, existsSync } from 'fs';
import { join, basename } from 'path';
import os from 'os';

const HOME = os.homedir();
const PROJECTS_DIR = join(HOME, '.claude', 'projects', 'C--Users-medin');
const OUT_DIR = join(HOME, 'Desktop', 'backup_judx', 'resultados', 'transcripts');

function readStdinJSON() {
  try {
    const data = readFileSync(0, 'utf-8');
    return JSON.parse(data);
  } catch { return null; }
}

function findLatestJSONL() {
  const files = readdirSync(PROJECTS_DIR)
    .filter(f => f.endsWith('.jsonl'))
    .map(f => ({ f, t: statSync(join(PROJECTS_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files[0] ? join(PROJECTS_DIR, files[0].f) : null;
}

function fmtDateStamp(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

// Redige secrets antes de persistir transcript
function redactSecrets(text) {
  if (!text) return text;
  return text
    .replace(/APIKey\s+[A-Za-z0-9+/=]{40,}/g, 'APIKey ***REDACTED***')
    .replace(/Authorization:\s*(APIKey|Bearer)\s+\S+/gi, 'Authorization: $1 ***REDACTED***')
    .replace(/DATAJUD_APIKEY=[^\s]+/g, 'DATAJUD_APIKEY=***REDACTED***')
    .replace(/(?:password|senha|secret|token|apikey)[=:]\s*["']?[A-Za-z0-9+/=_\-]{20,}["']?/gi, (m) => m.split(/[=:]/)[0] + '=***REDACTED***')
    .replace(/postgresql:\/\/[^:]+:[^@]+@/g, 'postgresql://***:***@')
    .replace(/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/g, '***JWT_REDACTED***');
}

function extractText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = [];
  for (const b of content) {
    if (b?.type === 'text' && b.text) parts.push(b.text);
    else if (b?.type === 'tool_use') {
      const args = JSON.stringify(b.input ?? {}).slice(0, 500);
      parts.push(`\n**[tool: ${b.name}]** ${args}${args.length >= 500 ? '...' : ''}`);
    }
    else if (b?.type === 'tool_result') {
      const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content ?? '');
      parts.push(`\n**[tool_result]** ${out.slice(0, 400)}${out.length > 400 ? '...[truncado]' : ''}`);
    }
  }
  return parts.join('\n');
}

function jsonlToMarkdown(jsonlPath) {
  const raw = readFileSync(jsonlPath, 'utf-8');
  const lines = raw.split('\n').filter(Boolean);
  const turns = [];
  let startTime = null;
  let endTime = null;

  for (const line of lines) {
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const ts = obj.timestamp ? new Date(obj.timestamp) : null;
    if (ts) {
      if (!startTime || ts < startTime) startTime = ts;
      if (!endTime || ts > endTime) endTime = ts;
    }
    if (obj.type === 'user' || obj.type === 'assistant') {
      const content = obj.message?.content ?? obj.content ?? '';
      const text = redactSecrets(extractText(content));
      if (text.trim()) {
        turns.push({ role: obj.type, text, ts });
      }
    }
  }

  const header = [
    `# Transcript — sessão Claude Code`,
    ``,
    `**Arquivo fonte**: \`${basename(jsonlPath)}\``,
    `**Início**: ${startTime ? startTime.toISOString() : 'desconhecido'}`,
    `**Fim**: ${endTime ? endTime.toISOString() : 'desconhecido'}`,
    `**Turnos**: ${turns.length}`,
    ``,
    `---`,
    ``,
  ].join('\n');

  const body = turns.map(t => {
    const role = t.role === 'user' ? '## Usuária' : '## Assistente';
    const ts = t.ts ? ` _(${t.ts.toISOString()})_` : '';
    return `${role}${ts}\n\n${t.text}\n`;
  }).join('\n---\n\n');

  return { md: header + body, startTime: startTime ?? new Date(), turns: turns.length };
}

function main() {
  const stdin = readStdinJSON();
  let transcriptPath = stdin?.transcript_path || process.argv[2];
  if (!transcriptPath) transcriptPath = findLatestJSONL();
  if (!transcriptPath || !existsSync(transcriptPath)) {
    console.error(`[save-transcript] nenhum .jsonl encontrado`);
    process.exit(0);
  }

  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });

  const { md, startTime, turns } = jsonlToMarkdown(transcriptPath);
  const sid = basename(transcriptPath).replace('.jsonl', '').slice(0, 8);
  const stamp = fmtDateStamp(startTime);
  const outPath = join(OUT_DIR, `${stamp}_session_${sid}.md`);

  writeFileSync(outPath, md, 'utf-8');
  const sizeKB = (md.length / 1024).toFixed(1);
  console.error(`[save-transcript] ${outPath} (${sizeKB} KB, ${turns} turnos)`);
}

main();
