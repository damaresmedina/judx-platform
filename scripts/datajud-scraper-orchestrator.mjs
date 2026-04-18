/**
 * datajud-scraper-orchestrator.mjs — orquestra os 90 workers do Datajud
 *
 * Fases (execução sequencial de grupos, com concorrência dentro de cada grupo):
 *   0 = setup (cria estrutura em G:/datajud_raw/)
 *   1 = piloto: superiores + TJMs + TREs pequenos (~12M docs, 4-8h)
 *   2 = meio: TRFs + TRTs + TJs médios + TREs grandes (~95M, 18-30h)
 *   3 = gigantes: TJSP/TJMG/TJRJ/TJBA/TJRS/TJPR/TJSC/TJGO/TJPE (~185M, 2-4 dias)
 *
 * Uso:
 *   node scripts/datajud-scraper-orchestrator.mjs setup
 *   node scripts/datajud-scraper-orchestrator.mjs fase1
 *   node scripts/datajud-scraper-orchestrator.mjs fase2
 *   node scripts/datajud-scraper-orchestrator.mjs fase3
 *   node scripts/datajud-scraper-orchestrator.mjs status
 *   node scripts/datajud-scraper-orchestrator.mjs <alias1> [<alias2> ...]   # endpoints específicos
 */

import { spawn } from 'child_process';
import { mkdirSync, existsSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const WORKER = join(__dirname, 'datajud-scraper-worker.mjs');
const RAW_ROOT = 'G:/datajud_raw';

// -- Catálogo dos 90 endpoints classificados ---------------------------------
const ALL = {
  superior: [
    ['api_publica_stj','STJ','Superior Tribunal de Justiça',3390010],
    ['api_publica_tst','TST','Tribunal Superior do Trabalho',4773267],
    ['api_publica_tse','TSE','Tribunal Superior Eleitoral',83871],
    ['api_publica_stm','STM','Superior Tribunal Militar',25966],
  ],
  federal: [
    ['api_publica_trf1','TRF1','TRF 1ª Região',5063566],
    ['api_publica_trf2','TRF2','TRF 2ª Região',4202908],
    ['api_publica_trf3','TRF3','TRF 3ª Região',16871517],
    ['api_publica_trf4','TRF4','TRF 4ª Região',13966944],
    ['api_publica_trf5','TRF5','TRF 5ª Região',6537373],
    ['api_publica_trf6','TRF6','TRF 6ª Região',4245582],
  ],
  estadual: [
    ['api_publica_tjac','TJAC','Tribunal de Justiça do Acre',957465],
    ['api_publica_tjal','TJAL','Tribunal de Justiça de Alagoas',2943227],
    ['api_publica_tjam','TJAM','Tribunal de Justiça do Amazonas',4319062],
    ['api_publica_tjap','TJAP','Tribunal de Justiça do Amapá',673347],
    ['api_publica_tjba','TJBA','Tribunal de Justiça da Bahia',14640270],
    ['api_publica_tjce','TJCE','Tribunal de Justiça do Ceará',4431686],
    ['api_publica_tjdft','TJDFT','TJ do Distrito Federal e Territórios',3453628],
    ['api_publica_tjes','TJES','Tribunal de Justiça do Espírito Santo',2949131],
    ['api_publica_tjgo','TJGO','Tribunal de Justiça de Goiás',6675441],
    ['api_publica_tjma','TJMA','Tribunal de Justiça do Maranhão',4074375],
    ['api_publica_tjmg','TJMG','Tribunal de Justiça de Minas Gerais',35376520],
    ['api_publica_tjms','TJMS','Tribunal de Justiça de Mato Grosso do Sul',3372661],
    ['api_publica_tjmt','TJMT','Tribunal de Justiça de Mato Grosso',4278499],
    ['api_publica_tjpa','TJPA','Tribunal de Justiça do Pará',3312872],
    ['api_publica_tjpb','TJPB','Tribunal de Justiça da Paraíba',2535961],
    ['api_publica_tjpe','TJPE','Tribunal de Justiça de Pernambuco',6250191],
    ['api_publica_tjpi','TJPI','Tribunal de Justiça do Piauí',2067149],
    ['api_publica_tjpr','TJPR','Tribunal de Justiça do Paraná',12382336],
    ['api_publica_tjrj','TJRJ','Tribunal de Justiça do Rio de Janeiro',16485053],
    ['api_publica_tjrn','TJRN','Tribunal de Justiça do Rio Grande do Norte',2545920],
    ['api_publica_tjro','TJRO','Tribunal de Justiça de Rondônia',1997861],
    ['api_publica_tjrr','TJRR','Tribunal de Justiça de Roraima',349531],
    ['api_publica_tjrs','TJRS','Tribunal de Justiça do Rio Grande do Sul',13419220],
    ['api_publica_tjsc','TJSC','Tribunal de Justiça de Santa Catarina',10267930],
    ['api_publica_tjse','TJSE','Tribunal de Justiça de Sergipe',3005878],
    ['api_publica_tjsp','TJSP','Tribunal de Justiça de São Paulo',71899024],
    ['api_publica_tjto','TJTO','Tribunal de Justiça do Tocantins',2676853],
  ],
  trabalho: [
    ['api_publica_trt1','TRT1','TRT 1ª Região',2666555],
    ['api_publica_trt2','TRT2','TRT 2ª Região',4980727],
    ['api_publica_trt3','TRT3','TRT 3ª Região',4062024],
    ['api_publica_trt4','TRT4','TRT 4ª Região',2050441],
    ['api_publica_trt5','TRT5','TRT 5ª Região',1221005],
    ['api_publica_trt6','TRT6','TRT 6ª Região',939458],
    ['api_publica_trt7','TRT7','TRT 7ª Região',664127],
    ['api_publica_trt8','TRT8','TRT 8ª Região',540519],
    ['api_publica_trt9','TRT9','TRT 9ª Região',1487552],
    ['api_publica_trt10','TRT10','TRT 10ª Região',699710],
    ['api_publica_trt11','TRT11','TRT 11ª Região',359772],
    ['api_publica_trt12','TRT12','TRT 12ª Região',910843],
    ['api_publica_trt13','TRT13','TRT 13ª Região',328753],
    ['api_publica_trt14','TRT14','TRT 14ª Região',251008],
    ['api_publica_trt15','TRT15','TRT 15ª Região',3585258],
    ['api_publica_trt16','TRT16','TRT 16ª Região',397644],
    ['api_publica_trt17','TRT17','TRT 17ª Região',577517],
    ['api_publica_trt18','TRT18','TRT 18ª Região',772400],
    ['api_publica_trt19','TRT19','TRT 19ª Região',434361],
    ['api_publica_trt20','TRT20','TRT 20ª Região',223239],
    ['api_publica_trt21','TRT21','TRT 21ª Região',245338],
    ['api_publica_trt22','TRT22','TRT 22ª Região',260820],
    ['api_publica_trt23','TRT23','TRT 23ª Região',333264],
    ['api_publica_trt24','TRT24','TRT 24ª Região',297681],
  ],
  eleitoral: [
    ['api_publica_tre-ac','TRE-AC','TRE AC',20895],
    ['api_publica_tre-al','TRE-AL','TRE AL',59134],
    ['api_publica_tre-am','TRE-AM','TRE AM',78771],
    ['api_publica_tre-ap','TRE-AP','TRE AP',19145],
    ['api_publica_tre-ba','TRE-BA','TRE BA',295566],
    ['api_publica_tre-ce','TRE-CE','TRE CE',137443],
    ['api_publica_tre-es','TRE-ES','TRE ES',86135],
    ['api_publica_tre-go','TRE-GO','TRE GO',220098],
    ['api_publica_tre-ma','TRE-MA','TRE MA',221053],
    ['api_publica_tre-mg','TRE-MG','TRE MG',591340],
    ['api_publica_tre-ms','TRE-MS','TRE MS',102947],
    ['api_publica_tre-mt','TRE-MT','TRE MT',103369],
    ['api_publica_tre-pa','TRE-PA','TRE PA',226706],
    ['api_publica_tre-pb','TRE-PB','TRE PB',94830],
    ['api_publica_tre-pe','TRE-PE','TRE PE',143885],
    ['api_publica_tre-pi','TRE-PI','TRE PI',90002],
    ['api_publica_tre-pr','TRE-PR','TRE PR',298959],
    ['api_publica_tre-rj','TRE-RJ','TRE RJ',208588],
    ['api_publica_tre-rn','TRE-RN','TRE RN',83674],
    ['api_publica_tre-ro','TRE-RO','TRE RO',43824],
    ['api_publica_tre-rr','TRE-RR','TRE RR',18213],
    ['api_publica_tre-rs','TRE-RS','TRE RS',302949],
    ['api_publica_tre-sc','TRE-SC','TRE SC',187417],
    ['api_publica_tre-se','TRE-SE','TRE SE',52764],
    ['api_publica_tre-sp','TRE-SP','TRE SP',1156806],
    ['api_publica_tre-to','TRE-TO','TRE TO',65478],
    // TRE-DFT omitido: 404 na diagnose, alias precisa ser investigado
  ],
  militar: [
    ['api_publica_tjmmg','TJMMG','Tribunal Justiça Militar MG',29995],
    ['api_publica_tjmrs','TJMRS','Tribunal Justiça Militar RS',10425],
    ['api_publica_tjmsp','TJMSP','Tribunal Justiça Militar SP',19140],
  ],
};

function getLevel(category) {
  if (category === 'superior') return 'nivel_1_anteparos';
  return 'nivel_2_regionais/' + category;
}

function outDirFor(category, sigla) {
  return `${RAW_ROOT}/${getLevel(category)}/${sigla}`;
}

// -- Fases -------------------------------------------------------------------
const PHASES = {
  fase1_piloto: () => [
    ...ALL.superior,
    ...ALL.militar,
    ...ALL.eleitoral.filter(([,,,n]) => n < 100_000),
  ],
  fase2_meio: () => {
    return [
      ...ALL.federal,
      ...ALL.trabalho,
      ...ALL.estadual.filter(([,,,n]) => n < 10_000_000),
      ...ALL.eleitoral.filter(([,,,n]) => n >= 100_000),
    ];
  },
  // Gigantes SEM TJSP — TJSP fica reservado para fase 4 dedicada (sharding por dataAjuizamento)
  fase3_gigantes: () => ALL.estadual.filter(([, sigla, , n]) => n >= 10_000_000 && sigla !== 'TJSP'),
  fase4_tjsp: () => ALL.estadual.filter(([, sigla]) => sigla === 'TJSP'),
};


// -- Map sigla → category ----------------------------------------------------
const SIGLA2CAT = {};
for (const [cat, list] of Object.entries(ALL)) {
  for (const [, sigla] of list) SIGLA2CAT[sigla] = cat;
}

// -- Setup -------------------------------------------------------------------
function setup() {
  mkdirSync(RAW_ROOT, { recursive: true });
  mkdirSync(`${RAW_ROOT}/nivel_0_stf`, { recursive: true });
  mkdirSync(`${RAW_ROOT}/nivel_1_anteparos`, { recursive: true });
  for (const cat of ['tj','trf','trt','tre','tjm']) {
    mkdirSync(`${RAW_ROOT}/nivel_2_regionais/${cat}`, { recursive: true });
  }
  mkdirSync(`${RAW_ROOT}/nivel_3_varas`, { recursive: true });

  // manifest global — será atualizado por cada worker ao terminar
  const manifestPath = `${RAW_ROOT}/manifest.json`;
  if (!existsSync(manifestPath)) {
    writeFileSync(manifestPath, JSON.stringify({
      criado_em: new Date().toISOString(),
      fonte: 'Datajud CNJ — API pública',
      endpoints_total_esperado: Object.values(ALL).flat().length,
      total_documentos_esperado: Object.values(ALL).flat().reduce((s,[,,,n])=>s+n,0),
      fases: { fase1_piloto: 'pendente', fase2_meio: 'pendente', fase3_gigantes: 'pendente' }
    }, null, 2));
  }
  console.log(`[setup] estrutura criada em ${RAW_ROOT}`);
}

// -- Status ------------------------------------------------------------------
function status() {
  if (!existsSync(RAW_ROOT)) { console.log('[status] G:/datajud_raw não existe — rode setup'); return; }
  console.log(`[status] diretório raiz: ${RAW_ROOT}\n`);
  let totalOk = 0, totalPend = 0, totalDocs = 0, totalEsperado = 0;
  for (const [cat, list] of Object.entries(ALL)) {
    for (const [alias, sigla, nome, esperado] of list) {
      totalEsperado += esperado;
      const chkPath = `${outDirFor(cat, sigla)}/checkpoint.json`;
      if (existsSync(chkPath)) {
        try {
          const c = JSON.parse(readFileSync(chkPath,'utf-8'));
          const pct = ((c.total_fetched/esperado)*100).toFixed(1);
          const st = c.done ? 'OK' : `${pct}%`;
          console.log(`  ${sigla.padEnd(8)} ${st.padStart(6)}  ${c.total_fetched.toLocaleString('pt-BR')} / ${esperado.toLocaleString('pt-BR')}`);
          if (c.done) totalOk++; else totalPend++;
          totalDocs += c.total_fetched;
        } catch { totalPend++; }
      } else {
        totalPend++;
      }
    }
  }
  console.log(`\n[status] concluídos: ${totalOk} | pendentes: ${totalPend} | docs coletados: ${totalDocs.toLocaleString('pt-BR')} / ${totalEsperado.toLocaleString('pt-BR')}`);
}

// -- Pool runner -------------------------------------------------------------
async function runPool(tasks, limit) {
  let idx = 0;
  const running = new Set();
  const results = [];
  const next = () => {
    if (idx >= tasks.length) return;
    const i = idx++;
    const task = tasks[i];
    const p = task().then(r => { results[i] = r; running.delete(p); });
    running.add(p);
  };
  while (idx < tasks.length && running.size < limit) next();
  while (running.size > 0) { await Promise.race(running); if (idx < tasks.length) next(); }
  return results;
}

function runWorker(alias, sigla, outDir) {
  return new Promise((resolve) => {
    const child = spawn('node', [WORKER, alias, outDir], { stdio: 'inherit' });
    child.on('exit', code => resolve({ alias, sigla, code }));
  });
}

async function runPhase(phaseName, concurrency = 8) {
  const list = PHASES[phaseName]();
  console.log(`[${phaseName}] ${list.length} endpoints com concorrência ${concurrency}\n`);
  const tasks = list.map(([alias, sigla, nome]) => async () => {
    const cat = SIGLA2CAT[sigla];
    const out = outDirFor(cat, sigla);
    mkdirSync(out, { recursive: true });
    console.log(`[pool] iniciando ${sigla} em ${out}`);
    return runWorker(alias, sigla, out);
  });
  await runPool(tasks, concurrency);
  console.log(`\n[${phaseName}] concluída.`);
}

// -- CLI ---------------------------------------------------------------------
const cmd = process.argv[2];

if (cmd === 'setup') setup();
else if (cmd === 'status') status();
else if (cmd === 'fase1') { setup(); await runPhase('fase1_piloto', 8); }
else if (cmd === 'fase2') { await runPhase('fase2_meio', 8); }
else if (cmd === 'fase3') { await runPhase('fase3_gigantes', 4); }
else if (cmd === 'fase4') { await runPhase('fase4_tjsp', 1); }
else if (cmd && !['setup','status','fase1','fase2','fase3','fase4'].includes(cmd)) {
  // lista de aliases específicos
  const aliases = process.argv.slice(2);
  const found = [];
  for (const [cat, list] of Object.entries(ALL)) {
    for (const e of list) if (aliases.includes(e[0]) || aliases.includes(e[1])) found.push([cat, ...e]);
  }
  if (!found.length) { console.error('Nenhum alias encontrado'); process.exit(1); }
  setup();
  const tasks = found.map(([cat, alias, sigla]) => async () => {
    const out = outDirFor(cat, sigla);
    mkdirSync(out, { recursive: true });
    return runWorker(alias, sigla, out);
  });
  await runPool(tasks, 4);
}
else {
  console.log('Uso: node datajud-scraper-orchestrator.mjs <setup|status|fase1|fase2|fase3|alias1 alias2 ...>');
}
