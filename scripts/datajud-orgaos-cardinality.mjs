/**
 * datajud-orgaos-cardinality.mjs
 * Para cada endpoint Datajud, conta o nº distintos de orgaoJulgador.codigo.
 * Revela o nº real de nós institucionais (varas, turmas, colegiados) por tribunal.
 *
 * Output: G:/datajud_raw/_mapeamento_numerico/2026-04-17_nos_por_endpoint.{json,csv,md}
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

function body() {
  return {
    size: 0,
    track_total_hits: false,
    aggs: {
      orgaos_unicos: { cardinality: { field: 'orgaoJulgador.codigo', precision_threshold: 40000 } },
      orgaos_por_grau: {
        terms: { field: 'grau.keyword', size: 20 },
        aggs: { orgaos: { cardinality: { field: 'orgaoJulgador.codigo', precision_threshold: 40000 } } }
      }
    }
  };
}

async function count(alias, attempt=1) {
  const url = `${BASE}/${alias}/_search`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `APIKey ${APIKEY}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify(body()),
    });
    if (r.status === 429 || r.status >= 500) {
      if (attempt > 3) return { erro: `HTTP ${r.status}` };
      await new Promise(res => setTimeout(res, attempt*5000));
      return count(alias, attempt+1);
    }
    if (!r.ok) return { erro: `HTTP ${r.status}` };
    const j = await r.json();
    return {
      total_nos: j?.aggregations?.orgaos_unicos?.value,
      por_grau: (j?.aggregations?.orgaos_por_grau?.buckets || []).map(b => ({
        grau: b.key, docs: b.doc_count, nos: b.orgaos.value
      })),
      took_ms: j?.took,
    };
  } catch (e) {
    if (attempt > 3) return { erro: e.message };
    await new Promise(res => setTimeout(res, attempt*5000));
    return count(alias, attempt+1);
  }
}

const resultados = [];
const t0 = Date.now();
for (const [ramo, sigla, alias] of ENDPOINTS) {
  process.stdout.write(`${sigla.padEnd(8)} `);
  const r = await count(alias);
  if (r.erro) {
    console.log(`ERRO: ${r.erro}`);
    resultados.push({ ramo, sigla, alias, erro: r.erro });
  } else {
    const grausStr = r.por_grau.map(g => `${g.grau}=${g.nos}`).join(' ');
    console.log(`${String(r.total_nos).padStart(6)} nós (${grausStr}) ${r.took_ms}ms`);
    resultados.push({ ramo, sigla, alias, total_nos: r.total_nos, por_grau: r.por_grau });
  }
  await new Promise(res => setTimeout(res, 500));
}

const elapsed = ((Date.now()-t0)/1000).toFixed(1);
const totalNacional = resultados.reduce((s, r) => s + (r.total_nos || 0), 0);
const totalPorRamo = {};
for (const r of resultados) {
  if (!r.total_nos) continue;
  totalPorRamo[r.ramo] = (totalPorRamo[r.ramo] || 0) + r.total_nos;
}

writeFileSync(join(OUT, '2026-04-17_nos_por_endpoint.json'),
  JSON.stringify({ gerado: new Date().toISOString(), elapsed_s: parseFloat(elapsed), total_nacional: totalNacional, total_por_ramo: totalPorRamo, endpoints: resultados }, null, 2));

// CSV
const csvRows = ['ramo,sigla,alias,total_nos'];
for (const r of resultados) csvRows.push(`${r.ramo},${r.sigla},${r.alias},${r.total_nos ?? ''}`);
writeFileSync(join(OUT, '2026-04-17_nos_por_endpoint.csv'), csvRows.join('\n'));

// MD
const md = [`# Datajud — Nós Institucionais (orgaoJulgador distintos) por Endpoint`, ``, `Gerado: ${new Date().toISOString()} · ${elapsed}s`, ``, `**Total nacional de nós**: ${totalNacional.toLocaleString('pt-BR')}`, ``, `## Por ramo`, '', '| Ramo | Nós |', '|---|---:|'];
for (const [ramo, n] of Object.entries(totalPorRamo).sort((a,b) => b[1]-a[1])) {
  md.push(`| ${ramo} | ${n.toLocaleString('pt-BR')} |`);
}
md.push('', '## Por endpoint (ordem decrescente)', '', '| Sigla | Ramo | Nós |', '|---|---|---:|');
const sorted = resultados.filter(r => r.total_nos).sort((a,b) => b.total_nos - a.total_nos);
for (const r of sorted) md.push(`| ${r.sigla} | ${r.ramo} | ${r.total_nos.toLocaleString('pt-BR')} |`);
writeFileSync(join(OUT, '2026-04-17_nos_por_endpoint.md'), md.join('\n'));

console.log(`\n[OK] ${totalNacional.toLocaleString('pt-BR')} nós nacionais em ${elapsed}s`);
console.log(`Outputs em ${OUT}/2026-04-17_nos_por_endpoint.{json,csv,md}`);
