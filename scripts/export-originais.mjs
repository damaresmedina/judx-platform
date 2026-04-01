import pg from 'pg';
import fs from 'fs';
const { Client } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const c = new Client('postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres');
const DIR = 'C:/Users/medin/Desktop/backup_judx/resultados';

async function exportTable(name, query, header) {
  console.log(`[${name}] Iniciando...`);
  const start = Date.now();
  const ws = fs.createWriteStream(`${DIR}/ORIGINAL_${name}_28mar2026.csv`);
  ws.write(header + '\n');
  
  await c.query('BEGIN');
  await c.query(`DECLARE cur_${name} CURSOR FOR ${query}`);
  let total = 0;
  while (true) {
    const r = await c.query(`FETCH 20000 FROM cur_${name}`);
    if (r.rows.length === 0) break;
    for (const row of r.rows) {
      ws.write(Object.values(row).map(v => String(v ?? '').replace(/;/g, ',').replace(/\n/g, ' ')).join(';') + '\n');
    }
    total += r.rows.length;
    if (total % 100000 === 0) console.log(`  [${name}] ${total} rows...`);
  }
  await c.query(`CLOSE cur_${name}`);
  await c.query('COMMIT');
  ws.end();
  await new Promise(r => ws.on('finish', r));
  const sec = ((Date.now() - start) / 1000).toFixed(1);
  const mb = (fs.statSync(`${DIR}/ORIGINAL_${name}_28mar2026.csv`).size / 1024 / 1024).toFixed(1);
  console.log(`[${name}] DONE: ${total} rows, ${mb} MB, ${sec}s`);
}

await c.connect();

await exportTable('stf_partes',
  'SELECT id,incidente,processo,papel,nome,tipo,oab,created_at FROM stf_partes ORDER BY id',
  'id;incidente;processo;papel;nome;tipo;oab;created_at');

await exportTable('stf_decisoes',
  `SELECT id,processo,orgao_julgador,relator_decisao,relator_atual,data_autuacao,data_decisao,data_baixa,grupo_origem,tipo_classe,classe,ramo_direito,assunto,incidente,tipo_decisao,ambiente_julgamento,indicador_colegiado,id_fato_decisao FROM stf_decisoes ORDER BY id`,
  'id;processo;orgao_julgador;relator_decisao;relator_atual;data_autuacao;data_decisao;data_baixa;grupo_origem;tipo_classe;classe;ramo_direito;assunto;incidente;tipo_decisao;ambiente_julgamento;indicador_colegiado;id_fato_decisao');

await exportTable('judx_decision',
  `SELECT d.id, c.external_number as processo, d.decision_date, d.kind, d.result, d.session_environment, d.effective_environment, d.unanimity_signal, d.converted_from_virtual, d.oral_argument_present, d.argumentative_density, d.collegial_fragmentation, d.created_at FROM judx_decision d JOIN judx_case c ON c.id = d.case_id ORDER BY d.id`,
  'id;processo;decision_date;kind;result;session_environment;effective_environment;unanimity_signal;converted_from_virtual;oral_argument_present;argumentative_density;collegial_fragmentation;created_at');

await c.end();
console.log('\n=== TODAS CONCLUIDAS ===');
