/**
 * diagnostico-tjmg-gap.mjs
 *
 * Replicação do método de auditoria STJ (20/abr) para o TJMG:
 *   1. Consulta hits.total.value no Datajud com track_total_hits:true
 *   2. Conta IDs únicos no raw local
 *   3. Calcula gap = universo - raw_unique
 *
 * Não baixa nenhum doc. Apenas diagnostica.
 */
import { readFileSync, readdirSync, createReadStream } from 'fs';
import { join } from 'path';
import { createGunzip } from 'zlib';
import { createInterface } from 'readline';

const ENV = readFileSync('C:\\Users\\medin\\projetos\\judx-platform\\.env.local', 'utf-8');
const APIKEY = ENV.match(/^DATAJUD_APIKEY=(.+)$/m)[1].trim();
const BASE = 'https://api-publica.datajud.cnj.jus.br';
const ALIAS = 'api_publica_tjmg';
const RAW_DIR = 'G:/datajud_raw/nivel_2_regionais/estadual/TJMG';

// === 1) Universo Datajud ===
async function universoDatajud() {
  const body = {
    size: 0,
    track_total_hits: true,
    query: { match_all: {} }
  };
  const r = await fetch(`${BASE}/${ALIAS}/_search`, {
    method: 'POST',
    headers: {
      'Authorization': `APIKey ${APIKEY}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Datajud HTTP ${r.status}: ${(await r.text()).slice(0,300)}`);
  const j = await r.json();
  return j.hits.total.value;
}

// === 2) IDs únicos no raw ===
async function countUniqueIds() {
  const files = readdirSync(RAW_DIR)
    .filter(f => f.endsWith('.ndjson.gz'))
    .sort();
  console.log(`[raw] ${files.length} arquivos a processar`);
  const ids = new Set();
  let totalLines = 0;
  let lastLog = Date.now();
  for (let i = 0; i < files.length; i++) {
    const fp = join(RAW_DIR, files[i]);
    await new Promise((resolve, reject) => {
      const rl = createInterface({
        input: createReadStream(fp).pipe(createGunzip()),
        crlfDelay: Infinity
      });
      rl.on('line', (line) => {
        totalLines++;
        try {
          const d = JSON.parse(line);
          const id = d._id ?? d._source?.id ?? d.id;
          if (id) ids.add(id);
        } catch {}
      });
      rl.on('close', resolve);
      rl.on('error', reject);
    });
    if (Date.now() - lastLog > 5000 || i === files.length - 1) {
      const pct = ((i+1) / files.length * 100).toFixed(1);
      console.log(`  [${i+1}/${files.length}] ${pct}%  lines:${totalLines.toLocaleString('pt-BR')}  unique:${ids.size.toLocaleString('pt-BR')}`);
      lastLog = Date.now();
    }
  }
  return { unique: ids.size, totalLines };
}

const t0 = Date.now();
console.log(`[TJMG gap] start`);
console.log(`[TJMG gap] consultando universo Datajud...`);
const univ = await universoDatajud();
console.log(`[TJMG gap] universo Datajud: ${univ.toLocaleString('pt-BR')}\n`);

console.log(`[TJMG gap] contando IDs únicos no raw...`);
const { unique, totalLines } = await countUniqueIds();

const gap = univ - unique;
const pctGap = (gap / univ * 100).toFixed(3);
console.log(`\n=== DIAGNÓSTICO TJMG ===`);
console.log(`  Universo Datajud (hits.total.value): ${univ.toLocaleString('pt-BR')}`);
console.log(`  Linhas totais no raw:                 ${totalLines.toLocaleString('pt-BR')}`);
console.log(`  IDs únicos no raw:                    ${unique.toLocaleString('pt-BR')}`);
console.log(`  Duplicatas (linhas - únicos):         ${(totalLines - unique).toLocaleString('pt-BR')}`);
console.log(`  Gap (universo - raw único):           ${gap.toLocaleString('pt-BR')} (${pctGap}%)`);
console.log(`  Duração:                              ${Math.round((Date.now()-t0)/1000)}s`);
