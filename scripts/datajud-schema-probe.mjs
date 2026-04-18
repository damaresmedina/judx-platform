/**
 * datajud-schema-probe.mjs
 * Puxa 10 docs de cada um dos 90 endpoints, extrai estrutura, gera comparativo.
 *
 * Output: G:/datajud_raw/_mapeamento_estrutura/
 *   - 2026-04-17_estrutura_por_endpoint.json   (estrutura detalhada por sigla)
 *   - 2026-04-17_estrutura_comparada.md         (tabela comparativa)
 *   - samples/<SIGLA>.json                      (10 docs samples de cada)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ENV_PATH = join(process.cwd(), '.env.local');
const envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
const APIKEY = envText.match(/^DATAJUD_APIKEY=(.+)$/m)?.[1]?.trim();
const UA = envText.match(/^DATAJUD_USER_AGENT=(.+)$/m)?.[1]?.trim() || 'Mozilla/5.0';
const BASE = 'https://api-publica.datajud.cnj.jus.br';

const OUT = 'G:/datajud_raw/_mapeamento_estrutura';
const SAMPLES = join(OUT, 'samples');
mkdirSync(SAMPLES, { recursive: true });

const ENDPOINTS = [
  // ramo, sigla, alias
  ['superior','STJ','api_publica_stj'],
  ['superior','TST','api_publica_tst'],
  ['superior','TSE','api_publica_tse'],
  ['superior','STM','api_publica_stm'],
  ['federal','TRF1','api_publica_trf1'],['federal','TRF2','api_publica_trf2'],
  ['federal','TRF3','api_publica_trf3'],['federal','TRF4','api_publica_trf4'],
  ['federal','TRF5','api_publica_trf5'],['federal','TRF6','api_publica_trf6'],
  ...['tjac','tjal','tjam','tjap','tjba','tjce','tjdft','tjes','tjgo','tjma','tjmg','tjms','tjmt','tjpa','tjpb','tjpe','tjpi','tjpr','tjrj','tjrn','tjro','tjrr','tjrs','tjsc','tjse','tjsp','tjto']
    .map(a => ['estadual', a.toUpperCase(), `api_publica_${a}`]),
  ...Array.from({length:24}, (_,i)=>i+1).map(n => ['trabalho', `TRT${n}`, `api_publica_trt${n}`]),
  ...['ac','al','am','ap','ba','ce','es','go','ma','mg','ms','mt','pa','pb','pe','pi','pr','rj','rn','ro','rr','rs','sc','se','sp','to']
    .map(uf => ['eleitoral', `TRE-${uf.toUpperCase()}`, `api_publica_tre-${uf}`]),
  ['militar','TJMMG','api_publica_tjmmg'],['militar','TJMRS','api_publica_tjmrs'],['militar','TJMSP','api_publica_tjmsp'],
];

function keysDeep(obj, prefix='') {
  const out = new Set();
  if (obj === null || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const el of obj.slice(0,2)) {
      for (const k of keysDeep(el, prefix + '[]')) out.add(k);
    }
    return out;
  }
  for (const k of Object.keys(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    out.add(full);
    const v = obj[k];
    if (v && typeof v === 'object') {
      for (const kk of keysDeep(v, full)) out.add(kk);
    }
  }
  return out;
}

async function probeOne(ramo, sigla, alias) {
  const url = `${BASE}/${alias}/_search`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `APIKey ${APIKEY}`,
        'User-Agent': UA,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ size: 10, query: { match_all: {} } }),
    });
    if (!r.ok) {
      return { ramo, sigla, alias, status: r.status, erro: await r.text().then(t=>t.slice(0,200)) };
    }
    const j = await r.json();
    const hits = j?.hits?.hits ?? [];
    const total = j?.hits?.total?.value ?? null;
    if (!hits.length) return { ramo, sigla, alias, status: 200, erro: 'sem hits', total };

    // Salvar sample completo
    writeFileSync(join(SAMPLES, `${sigla}.json`), JSON.stringify(j, null, 2));

    // Agregar chaves de todos os _source
    const allKeys = new Set();
    for (const h of hits) for (const k of keysDeep(h._source)) allKeys.add(k);

    // Primeiro doc como exemplo
    const first = hits[0]._source;

    return {
      ramo, sigla, alias, status: 200, total,
      keys: [...allKeys].sort(),
      amostra_classes: [...new Set(hits.map(h => h._source?.classe?.nome).filter(Boolean))].slice(0,5),
      amostra_orgaos: [...new Set(hits.map(h => h._source?.orgaoJulgador?.nome).filter(Boolean))].slice(0,5),
      amostra_graus: [...new Set(hits.map(h => h._source?.grau).filter(Boolean))],
      qtd_movimentos_mediana: hits.map(h => (h._source?.movimentos ?? []).length).sort((a,b)=>a-b)[Math.floor(hits.length/2)],
      campos_faltantes_comuns: ['partes','decisao','ementa','valorCausa','dispositivo'].filter(k => !allKeys.has(k)),
    };
  } catch (e) {
    return { ramo, sigla, alias, erro: e.message };
  }
}

async function runPool(tasks, limit = 6) {
  const out = []; let i = 0; const running = new Set();
  const next = () => {
    if (i >= tasks.length) return;
    const idx = i++;
    const p = tasks[idx]().then(r => { out[idx] = r; running.delete(p); });
    running.add(p);
  };
  while (i < tasks.length && running.size < limit) next();
  while (running.size > 0) { await Promise.race(running); if (i < tasks.length) next(); }
  return out;
}

console.log(`[probe] ${ENDPOINTS.length} endpoints, concorrência 6, 10 docs cada`);
const tasks = ENDPOINTS.map(([r,s,a]) => () => probeOne(r,s,a));
const t0 = Date.now();
const results = await runPool(tasks, 6);
const secs = ((Date.now()-t0)/1000).toFixed(1);

// --- JSON detalhado ---
const jsonPath = join(OUT, '2026-04-17_estrutura_por_endpoint.json');
writeFileSync(jsonPath, JSON.stringify({ gerado_em: new Date().toISOString(), tempo_s: parseFloat(secs), endpoints: results }, null, 2));

// --- União de chaves por ramo ---
const keysPorRamo = {};
const keysGlobais = new Set();
for (const r of results) {
  if (!r.keys) continue;
  keysPorRamo[r.ramo] ??= new Set();
  for (const k of r.keys) { keysPorRamo[r.ramo].add(k); keysGlobais.add(k); }
}
const keysComuns = [...keysGlobais].filter(k =>
  Object.values(keysPorRamo).every(s => s.has(k))
).sort();

// --- Markdown comparativo ---
const md = [];
md.push('# Datajud — Mapeamento de Estrutura por Endpoint');
md.push(`\nGerado: 17/abr/2026 · ${secs}s · 10 docs por endpoint\n`);
md.push('## Chaves comuns a TODOS os ramos');
md.push('');
md.push(keysComuns.map(k => `- \`${k}\``).join('\n'));
md.push('');
md.push('## Chaves exclusivas por ramo');
md.push('');
for (const [ramo, kset] of Object.entries(keysPorRamo)) {
  const excl = [...kset].filter(k => !keysComuns.includes(k)).sort();
  if (excl.length) {
    md.push(`### ${ramo}`);
    md.push(excl.map(k => `- \`${k}\``).join('\n'));
    md.push('');
  }
}
md.push('## Por endpoint (total, classes, órgão típico, movimentos medianos)');
md.push('');
md.push('| Ramo | Sigla | Total docs | Classes (amostra) | Órgão (amostra) | Graus | Mov mediana | Status |');
md.push('|---|---|---:|---|---|---|---:|---|');
for (const r of results) {
  const cls = (r.amostra_classes || []).slice(0,2).join('; ');
  const org = (r.amostra_orgaos || []).slice(0,1).join('');
  const graus = (r.amostra_graus || []).join(',');
  md.push(`| ${r.ramo} | ${r.sigla} | ${(r.total ?? '-').toLocaleString?.('pt-BR') ?? r.total ?? '-'} | ${cls} | ${org} | ${graus} | ${r.qtd_movimentos_mediana ?? '-'} | ${r.erro ? '❌ '+r.erro.slice(0,30) : '✓'} |`);
}
md.push('');
md.push('## Campos NOTAVELMENTE AUSENTES em TODOS');
md.push('');
const todosAusentes = ['partes','decisao','ementa','valorCausa','dispositivo','magistrado','advogados'];
for (const campo of todosAusentes) {
  const presente = [...keysGlobais].some(k => k.includes(campo));
  md.push(`- \`${campo}\`: ${presente ? '**presente em algum endpoint**' : '**ausente em todos**'}`);
}
md.push('');
md.push('## Arquivos');
md.push(`- JSON detalhado: ${jsonPath}`);
md.push(`- Samples por endpoint: ${SAMPLES}/`);
writeFileSync(join(OUT, '2026-04-17_estrutura_comparada.md'), md.join('\n'));

console.log(`\n[probe] concluído em ${secs}s`);
console.log(`[probe] ${jsonPath}`);
console.log(`[probe] ${join(OUT,'2026-04-17_estrutura_comparada.md')}`);
console.log(`[probe] samples em ${SAMPLES}`);
