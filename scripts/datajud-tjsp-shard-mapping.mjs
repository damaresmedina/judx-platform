/**
 * datajud-tjsp-shard-mapping.mjs
 * Mapeia TJSP (e outros endpoints que dão 504) via sharding por ano.
 * Para cada ano 2000-2026, roda uma aggregation com range @timestamp.
 * Consolida os buckets no cliente.
 *
 * Uso: node scripts/datajud-tjsp-shard-mapping.mjs [alias1] [alias2]...
 *   sem args: roda TJSP + TRT12 por padrão
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const ENV_PATH = join(process.cwd(), '.env.local');
const envText = existsSync(ENV_PATH) ? readFileSync(ENV_PATH, 'utf-8') : '';
const APIKEY = envText.match(/^DATAJUD_APIKEY=(.+)$/m)?.[1]?.trim();
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE = 'https://api-publica.datajud.cnj.jus.br';
const OUT = 'G:/datajud_raw/_mapeamento_numerico/shards';
mkdirSync(OUT, { recursive: true });

const ALIASES = process.argv.slice(2);
const DEFAULT = [
  ['estadual','TJSP','api_publica_tjsp'],
  ['trabalho','TRT12','api_publica_trt12'],
];
const TARGETS = ALIASES.length
  ? ALIASES.map(a => ['?', a.replace(/^api_publica_/i,'').toUpperCase(), a.startsWith('api_publica_') ? a : 'api_publica_'+a.toLowerCase()])
  : DEFAULT;

const YEARS = Array.from({length: 27}, (_,i) => 2000+i); // 2000-2026
const SLEEP_MS = 2000;

function aggBody(from, to) {
  return {
    size: 0,
    track_total_hits: true,
    query: { range: { dataAjuizamento: { gte: from, lt: to } } },
    aggs: {
      por_grau: { terms: { field: 'grau.keyword', size: 20 } },
      por_sistema: { terms: { field: 'sistema.nome.keyword', size: 20 } },
      por_formato: { terms: { field: 'formato.nome.keyword', size: 5 } },
      por_sigilo: { terms: { field: 'nivelSigilo', size: 10 } },
      por_classe: { terms: { field: 'classe.nome.keyword', size: 30 } },
      por_orgao: { terms: { field: 'orgaoJulgador.nome.keyword', size: 30 } },
      por_assunto: { terms: { field: 'assuntos.nome.keyword', size: 30 } },
      stats_movimentos: { stats: { script: "doc['movimentos.codigo'].size()" } },
    }
  };
}

async function fetchShard(alias, fromIso, toIso, attempt=1) {
  const url = `${BASE}/${alias}/_search`;
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `APIKey ${APIKEY}`, 'User-Agent': UA, 'Content-Type': 'application/json' },
      body: JSON.stringify(aggBody(fromIso, toIso)),
    });
    if (r.status === 429 || r.status >= 500) {
      if (attempt > 3) return { alias, from: fromIso, erro: `HTTP ${r.status} (3 retries)` };
      console.log(`  retry ${attempt} em ${attempt*5}s (HTTP ${r.status})`);
      await new Promise(res => setTimeout(res, attempt*5000));
      return fetchShard(alias, fromIso, toIso, attempt+1);
    }
    if (!r.ok) {
      const t = await r.text();
      return { alias, from: fromIso, erro: `HTTP ${r.status}: ${t.slice(0,100)}` };
    }
    const j = await r.json();
    return {
      alias,
      from: fromIso, to: toIso,
      total: j?.hits?.total?.value,
      took_ms: j?.took,
      aggs: j?.aggregations,
    };
  } catch (e) {
    if (attempt > 3) return { alias, from: fromIso, erro: e.message };
    await new Promise(res => setTimeout(res, attempt*5000));
    return fetchShard(alias, fromIso, toIso, attempt+1);
  }
}

function mergeBuckets(shards, aggName) {
  const merged = {};
  for (const sh of shards) {
    const buckets = sh?.aggs?.[aggName]?.buckets || [];
    for (const b of buckets) {
      merged[b.key] = (merged[b.key] || 0) + b.doc_count;
    }
  }
  return Object.entries(merged)
    .map(([key, doc_count]) => ({ key, doc_count }))
    .sort((a,b) => b.doc_count - a.doc_count);
}

for (const [ramo, sigla, alias] of TARGETS) {
  console.log(`\n=== ${sigla} (${alias}) ===`);
  const outDir = join(OUT, sigla);
  mkdirSync(outDir, { recursive: true });

  const shards = [];
  const t0 = Date.now();
  for (const year of YEARS) {
    // dataAjuizamento é string YYYYMMDDHHmmss
    const from = `${year}0101000000`;
    const to = `${year+1}0101000000`;
    process.stdout.write(`  [${year}] `);
    const r = await fetchShard(alias, from, to);
    if (r.total !== undefined) {
      shards.push(r);
      console.log(`${r.total.toLocaleString('pt-BR')} docs (${r.took_ms}ms)`);
    } else {
      console.log(`ERRO: ${r.erro}`);
      shards.push(r);
    }
    await new Promise(res => setTimeout(res, SLEEP_MS));
  }

  const totalGeral = shards.reduce((s, sh) => s + (sh.total || 0), 0);
  const elapsed = ((Date.now()-t0)/1000).toFixed(1);

  console.log(`\n  TOTAL consolidado ${sigla}: ${totalGeral.toLocaleString('pt-BR')} docs (${elapsed}s)`);

  // Salvar shards crus
  writeFileSync(join(outDir, `${sigla}_shards_raw.json`),
    JSON.stringify({ sigla, alias, total_consolidado: totalGeral, shards }, null, 2));

  // Consolidar buckets
  const consolidado = {
    sigla, alias, total: totalGeral, elapsed_s: parseFloat(elapsed),
    por_grau: mergeBuckets(shards, 'por_grau'),
    por_sistema: mergeBuckets(shards, 'por_sistema'),
    por_formato: mergeBuckets(shards, 'por_formato'),
    por_sigilo: mergeBuckets(shards, 'por_sigilo'),
    top_classes: mergeBuckets(shards, 'por_classe').slice(0,50),
    top_orgaos: mergeBuckets(shards, 'por_orgao').slice(0,50),
    top_assuntos: mergeBuckets(shards, 'por_assunto').slice(0,50),
    por_ano: shards.filter(s => s.total !== undefined).map(s => ({ ano: s.from.slice(0,4), total: s.total })),
  };
  writeFileSync(join(outDir, `${sigla}_consolidado.json`), JSON.stringify(consolidado, null, 2));

  // CSVs
  const writeCsv = (name, data, col) => {
    const rows = [col+',doc_count', ...data.map(d => `"${String(d.key).replace(/"/g,'""')}",${d.doc_count}`)];
    writeFileSync(join(outDir, `${sigla}_${name}.csv`), rows.join('\n'));
  };
  writeCsv('graus', consolidado.por_grau, 'grau');
  writeCsv('sistemas', consolidado.por_sistema, 'sistema');
  writeCsv('classes_top50', consolidado.top_classes, 'classe');
  writeCsv('orgaos_top50', consolidado.top_orgaos, 'orgao');
  writeCsv('assuntos_top50', consolidado.top_assuntos, 'assunto');
  writeCsv('ano', consolidado.por_ano.map(x => ({key: x.ano, doc_count: x.total})), 'ano');

  console.log(`  outputs em ${outDir}/`);
}

console.log('\n[OK]');
