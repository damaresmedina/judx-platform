/**
 * datajud-numeric-mapping.mjs
 * Para cada um dos 90 endpoints, roda uma aggregation Elasticsearch com:
 *   - distribuição por grau, sistema, formato, sigilo
 *   - top 20 classes, top 20 órgãos julgadores, top 20 assuntos
 *   - histograma por ano (@timestamp)
 *   - stats de movimentos (min/max/avg/sum)
 *
 * Output: G:/datajud_raw/_mapeamento_numerico/
 *   2026-04-17_agregados_por_endpoint.json   (tudo consolidado)
 *   2026-04-17_totais_por_endpoint.csv
 *   2026-04-17_graus_por_endpoint.csv
 *   2026-04-17_classes_top20_por_endpoint.csv
 *   2026-04-17_orgaos_top20_por_endpoint.csv
 *   2026-04-17_assuntos_top20_por_endpoint.csv
 *   2026-04-17_ano_por_endpoint.csv
 *   2026-04-17_movimentos_stats.csv
 *   2026-04-17_mapeamento_numerico.md
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ENV_PATH = join(process.cwd(), '.env.local');
const envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
const APIKEY = envText.match(/^DATAJUD_APIKEY=(.+)$/m)?.[1]?.trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE = 'https://api-publica.datajud.cnj.jus.br';
const OUT = 'G:/datajud_raw/_mapeamento_numerico';
mkdirSync(OUT, { recursive: true });

const ENDPOINTS = [
  ['superior','STJ','api_publica_stj'],['superior','TST','api_publica_tst'],
  ['superior','TSE','api_publica_tse'],['superior','STM','api_publica_stm'],
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

function aggQuery() {
  return {
    size: 0,
    track_total_hits: true,
    aggs: {
      por_grau: { terms: { field: 'grau.keyword', size: 20 } },
      por_sistema: { terms: { field: 'sistema.nome.keyword', size: 20 } },
      por_formato: { terms: { field: 'formato.nome.keyword', size: 5 } },
      por_sigilo: { terms: { field: 'nivelSigilo', size: 10 } },
      por_classe: { terms: { field: 'classe.nome.keyword', size: 20 } },
      por_orgao: { terms: { field: 'orgaoJulgador.nome.keyword', size: 20 } },
      por_assunto: { terms: { field: 'assuntos.nome.keyword', size: 20 } },
      por_ano: { date_histogram: { field: '@timestamp', calendar_interval: 'year', format: 'yyyy', min_doc_count: 1 } },
      stats_movimentos: { stats: { script: "doc['movimentos.codigo'].size()" } },
    }
  };
}

async function aggOne(ramo, sigla, alias) {
  const url = `${BASE}/${alias}/_search`;
  for (let attempt=1; attempt<=3; attempt++) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Authorization': `APIKey ${APIKEY}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
        body: JSON.stringify(aggQuery()),
      });
      if (r.status === 429 || r.status >= 500) {
        await new Promise(res => setTimeout(res, 2000 * Math.pow(3, attempt-1)));
        continue;
      }
      if (!r.ok) {
        const t = await r.text();
        return { ramo, sigla, alias, status: r.status, erro: t.slice(0,200) };
      }
      const j = await r.json();
      return {
        ramo, sigla, alias, status: 200,
        total: j?.hits?.total?.value,
        took_ms: j?.took,
        aggs: j?.aggregations,
      };
    } catch (e) {
      if (attempt === 3) return { ramo, sigla, alias, erro: e.message };
      await new Promise(res => setTimeout(res, 2000 * Math.pow(3, attempt-1)));
    }
  }
}

async function runPool(tasks, limit=6) {
  const out = []; let i=0; const running = new Set();
  const next = () => {
    if (i >= tasks.length) return;
    const idx = i++;
    const p = tasks[idx]().then(r => { out[idx]=r; running.delete(p); });
    running.add(p);
  };
  while (i<tasks.length && running.size<limit) next();
  while (running.size>0) { await Promise.race(running); if (i<tasks.length) next(); }
  return out;
}

console.log(`[numeric-map] ${ENDPOINTS.length} endpoints, concorrência 6`);
const tasks = ENDPOINTS.map(([r,s,a]) => () => { process.stdout.write(`[${s}]`); return aggOne(r,s,a); });
const t0 = Date.now();
const resultsRaw = await runPool(tasks, 6);
const secs = ((Date.now()-t0)/1000).toFixed(1);
// Filtra undefined e preenche placeholders para os que retornaram undefined
const results = ENDPOINTS.map(([ramo, sigla, alias], i) => resultsRaw[i] ?? { ramo, sigla, alias, erro: 'undefined_result' });
console.log(`\n[numeric-map] concluído em ${secs}s (${results.filter(r => r.total).length}/${results.length} ok)`);

// -- JSON consolidado --
writeFileSync(join(OUT,'2026-04-17_agregados_por_endpoint.json'), JSON.stringify({ gerado_em: new Date().toISOString(), tempo_s: parseFloat(secs), endpoints: results }, null, 2));

// -- CSVs --
const safe = s => `"${String(s ?? '').replace(/"/g,'""')}"`;

// Totais
let csv = 'ramo,sigla,alias,total_documentos,took_ms,status\n';
for (const r of results) csv += `${safe(r.ramo)},${safe(r.sigla)},${safe(r.alias)},${r.total ?? ''},${r.took_ms ?? ''},${r.status ?? ''}\n`;
writeFileSync(join(OUT,'2026-04-17_totais_por_endpoint.csv'), csv);

// Graus
csv = 'ramo,sigla,grau,doc_count\n';
for (const r of results) {
  for (const b of (r.aggs?.por_grau?.buckets || [])) {
    csv += `${safe(r.ramo)},${safe(r.sigla)},${safe(b.key)},${b.doc_count}\n`;
  }
}
writeFileSync(join(OUT,'2026-04-17_graus_por_endpoint.csv'), csv);

// Classes top 20
csv = 'ramo,sigla,classe_nome,doc_count\n';
for (const r of results) {
  for (const b of (r.aggs?.por_classe?.buckets || [])) {
    csv += `${safe(r.ramo)},${safe(r.sigla)},${safe(b.key)},${b.doc_count}\n`;
  }
}
writeFileSync(join(OUT,'2026-04-17_classes_top20_por_endpoint.csv'), csv);

// Órgãos top 20
csv = 'ramo,sigla,orgao_julgador,doc_count\n';
for (const r of results) {
  for (const b of (r.aggs?.por_orgao?.buckets || [])) {
    csv += `${safe(r.ramo)},${safe(r.sigla)},${safe(b.key)},${b.doc_count}\n`;
  }
}
writeFileSync(join(OUT,'2026-04-17_orgaos_top20_por_endpoint.csv'), csv);

// Assuntos top 20
csv = 'ramo,sigla,assunto_nome,doc_count\n';
for (const r of results) {
  for (const b of (r.aggs?.por_assunto?.buckets || [])) {
    csv += `${safe(r.ramo)},${safe(r.sigla)},${safe(b.key)},${b.doc_count}\n`;
  }
}
writeFileSync(join(OUT,'2026-04-17_assuntos_top20_por_endpoint.csv'), csv);

// Ano
csv = 'ramo,sigla,ano,doc_count\n';
for (const r of results) {
  for (const b of (r.aggs?.por_ano?.buckets || [])) {
    csv += `${safe(r.ramo)},${safe(r.sigla)},${safe(b.key_as_string)},${b.doc_count}\n`;
  }
}
writeFileSync(join(OUT,'2026-04-17_ano_por_endpoint.csv'), csv);

// Movimentos stats
csv = 'ramo,sigla,count,min,max,avg,sum\n';
for (const r of results) {
  const s = r.aggs?.stats_movimentos;
  if (s) csv += `${safe(r.ramo)},${safe(r.sigla)},${s.count},${s.min},${s.max},${s.avg?.toFixed(2)},${s.sum}\n`;
}
writeFileSync(join(OUT,'2026-04-17_movimentos_stats.csv'), csv);

// Sistema
csv = 'ramo,sigla,sistema,doc_count\n';
for (const r of results) {
  for (const b of (r.aggs?.por_sistema?.buckets || [])) {
    csv += `${safe(r.ramo)},${safe(r.sigla)},${safe(b.key)},${b.doc_count}\n`;
  }
}
writeFileSync(join(OUT,'2026-04-17_sistemas_por_endpoint.csv'), csv);

// Formato
csv = 'ramo,sigla,formato,doc_count\n';
for (const r of results) {
  for (const b of (r.aggs?.por_formato?.buckets || [])) {
    csv += `${safe(r.ramo)},${safe(r.sigla)},${safe(b.key)},${b.doc_count}\n`;
  }
}
writeFileSync(join(OUT,'2026-04-17_formatos_por_endpoint.csv'), csv);

// -- MD consolidado --
const fmt = n => n == null ? '—' : Number(n).toLocaleString('pt-BR');
const md = [];
md.push('# Datajud — Mapeamento Numérico Completo');
md.push(`\nGerado: 17/abr/2026 · ${secs}s · 90 endpoints via aggregation Elasticsearch\n`);
md.push('## Totais por ramo');
md.push('');
const porRamo = {};
for (const r of results) {
  if (r.total == null) continue;
  porRamo[r.ramo] ??= { n: 0, endpoints: 0, mov_sum: 0 };
  porRamo[r.ramo].n += r.total;
  porRamo[r.ramo].endpoints++;
  porRamo[r.ramo].mov_sum += r.aggs?.stats_movimentos?.sum || 0;
}
md.push('| Ramo | Endpoints | Total processos | Total movimentos | Mov/processo |');
md.push('|---|---:|---:|---:|---:|');
let tp = 0, tm = 0;
for (const [ramo, x] of Object.entries(porRamo)) {
  md.push(`| ${ramo} | ${x.endpoints} | ${fmt(x.n)} | ${fmt(x.mov_sum)} | ${(x.mov_sum/x.n).toFixed(1)} |`);
  tp += x.n; tm += x.mov_sum;
}
md.push(`| **TOTAL** | **${results.filter(r=>r.total).length}** | **${fmt(tp)}** | **${fmt(tm)}** | **${(tm/tp).toFixed(1)}** |`);
md.push('');

md.push('## Stats de movimentos (eventos por processo)');
md.push('');
md.push('| Sigla | Total | Min | Max | Média | Sum |');
md.push('|---|---:|---:|---:|---:|---:|');
for (const r of results) {
  const s = r.aggs?.stats_movimentos;
  if (!s) continue;
  md.push(`| ${r.sigla} | ${fmt(r.total)} | ${s.min} | ${fmt(s.max)} | ${s.avg?.toFixed(1)} | ${fmt(s.sum)} |`);
}
md.push('');

md.push('## CSVs gerados');
md.push('');
const arquivos = [
  '2026-04-17_totais_por_endpoint.csv',
  '2026-04-17_graus_por_endpoint.csv',
  '2026-04-17_classes_top20_por_endpoint.csv',
  '2026-04-17_orgaos_top20_por_endpoint.csv',
  '2026-04-17_assuntos_top20_por_endpoint.csv',
  '2026-04-17_ano_por_endpoint.csv',
  '2026-04-17_movimentos_stats.csv',
  '2026-04-17_sistemas_por_endpoint.csv',
  '2026-04-17_formatos_por_endpoint.csv',
  '2026-04-17_agregados_por_endpoint.json',
];
for (const a of arquivos) md.push(`- \`${join(OUT, a)}\``);
writeFileSync(join(OUT,'2026-04-17_mapeamento_numerico.md'), md.join('\n'));

console.log(`[numeric-map] arquivos em ${OUT}`);
