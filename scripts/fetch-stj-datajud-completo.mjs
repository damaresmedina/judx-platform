/**
 * fetch-stj-datajud-completo.mjs
 * ============================================================
 * Extrai TODOS os processos STJ (2016-2026) via Datajud API
 * Pagina por mês para respeitar o limite de 10K por query
 * Salva: classe, número, data, relator/gabinete, assuntos, movimentos
 *
 * Uso:
 *   node scripts/fetch-stj-datajud-completo.mjs                  # tudo 2016-2026
 *   node scripts/fetch-stj-datajud-completo.mjs --resume         # continua de onde parou
 *   node scripts/fetch-stj-datajud-completo.mjs --ano 2024       # só um ano
 *   node scripts/fetch-stj-datajud-completo.mjs --limit 1000     # limitar registros (teste)
 * ============================================================
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';

const { Client } = pg;
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres';
const DATAJUD_URL = 'https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search';
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const LOG_FILE = path.join('logs', 'stj-datajud-completo.log');
const BACKUP_DIR = 'C:\\Users\\medin\\Desktop\\backup_judx\\resultados';
const BATCH_SIZE = 2000; // registros por página (máx API: 10000)
const DELAY_MS = 100;    // pausa mínima entre requests

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function searchDatajud(query) {
  const resp = await fetch(DATAJUD_URL, {
    method: 'POST',
    headers: {
      'Authorization': `ApiKey ${DATAJUD_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(query)
  });
  if (!resp.ok) throw new Error(`Datajud HTTP ${resp.status}: ${await resp.text()}`);
  return resp.json();
}

function extrairRelator(orgaoJulgador) {
  if (!orgaoJulgador?.nome) return { relator: null, gabinete: null };
  const nome = orgaoJulgador.nome;
  // "GABINETE DO MINISTRO RICARDO VILLAS BÔAS CUEVA" → relator
  const m = nome.match(/GABINETE\s+D[OA]\s+MINISTR[OA]\s+(.+)/i);
  if (m) return { relator: m[1].trim(), gabinete: nome };
  // "PRIMEIRA TURMA", "PRESIDÊNCIA", etc.
  return { relator: null, gabinete: nome };
}

function extrairAssuntos(assuntos) {
  if (!assuntos || !Array.isArray(assuntos)) return null;
  return assuntos.map(a => a.nome).join('; ');
}

function extrairUltimaFase(movimentos) {
  if (!movimentos || !Array.isArray(movimentos) || movimentos.length === 0) return null;
  // Ordenar por data desc
  const sorted = [...movimentos].sort((a, b) =>
    new Date(b.dataHora || 0) - new Date(a.dataHora || 0)
  );
  return sorted[0]?.nome || null;
}

function extrairDecisoes(movimentos) {
  if (!movimentos || !Array.isArray(movimentos)) return [];
  // Códigos de decisão: 235 (Não Conhecimento), 195 (Julgamento), 22 (Baixa), 848 (Trânsito), etc.
  const DECISAO_CODIGOS = [193, 195, 196, 198, 200, 206, 207, 210, 220, 221, 235, 237, 449, 450, 456, 457, 462, 848];
  return movimentos.filter(m => DECISAO_CODIGOS.includes(m.codigo)).map(m => ({
    codigo: m.codigo,
    nome: m.nome,
    data: m.dataHora,
    orgao: m.orgaoJulgador?.nome || null
  }));
}

// Gerar fatias de tempo (semanas) para garantir que cada fatia < 10K
function gerarFatias(anoInicio, anoFim) {
  const fatias = [];
  // Gerar semanas do mais recente ao mais antigo
  const fim = new Date(anoFim, 11, 31);
  const inicio = new Date(anoInicio, 0, 1);

  let cursor = new Date(fim);
  while (cursor >= inicio) {
    const fimSemana = new Date(cursor);
    const inicioSemana = new Date(cursor);
    inicioSemana.setDate(inicioSemana.getDate() - 6);
    if (inicioSemana < inicio) inicioSemana.setTime(inicio.getTime());

    const gte = inicioSemana.toISOString().slice(0, 10);
    const lte = fimSemana.toISOString().slice(0, 10);

    fatias.push({ label: `${gte}/${lte}`, gte, lte });

    cursor.setDate(cursor.getDate() - 7);
  }
  return fatias;
}

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const anoIdx = args.indexOf('--ano');
  const limitIdx = args.indexOf('--limit');
  const anoUnico = anoIdx > -1 ? parseInt(args[anoIdx + 1]) : null;
  const globalLimit = limitIdx > -1 ? parseInt(args[limitIdx + 1]) : null;

  if (!fs.existsSync('logs')) fs.mkdirSync('logs');

  const client = new Client(DB_URL);
  await client.connect();
  log('Conectado ao banco JudX');

  // Criar tabela se não existir
  await client.query(`
    CREATE TABLE IF NOT EXISTS stj_datajud (
      id SERIAL PRIMARY KEY,
      numero_processo TEXT NOT NULL UNIQUE,
      classe_codigo INT,
      classe_nome TEXT,
      data_ajuizamento TIMESTAMPTZ,
      relator TEXT,
      gabinete TEXT,
      orgao_julgador_codigo INT,
      assuntos TEXT,
      assuntos_json JSONB,
      ultima_fase TEXT,
      total_movimentos INT,
      decisoes_json JSONB,
      formato TEXT,
      grau TEXT,
      nivel_sigilo INT,
      data_ultima_atualizacao TIMESTAMPTZ,
      movimentos_json JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
  await client.query('CREATE INDEX IF NOT EXISTS idx_stj_datajud_classe ON stj_datajud(classe_nome)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_stj_datajud_relator ON stj_datajud(relator)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_stj_datajud_data ON stj_datajud(data_ajuizamento)');
  log('Tabela stj_datajud pronta');

  // Definir período
  const anoInicio = anoUnico || 2016;
  const anoFim = anoUnico || 2026;
  const meses = gerarFatias(anoInicio, anoFim);
  log(`Período: ${anoInicio}-${anoFim} (${meses.length} semanas, do mais recente ao mais antigo)`);

  // Se resume, contar registros por semana para pular as já completas
  const semanasCompletas = new Set();
  if (resume) {
    const r = await client.query('SELECT count(*) as n FROM stj_datajud');
    log(`Resume: ${r.rows[0].n} processos já no banco`);
    // Marcar semanas que já têm registros — serão puladas
    const anoFilter = anoUnico ? `AND extract(year from data_ajuizamento) = ${anoUnico}` : '';
    const weeks = await client.query(`
      SELECT to_char(data_ajuizamento, 'YYYY-MM-DD') as d, count(*) as n
      FROM stj_datajud
      WHERE data_ajuizamento IS NOT NULL ${anoFilter}
      GROUP BY d
    `);
    // Agrupar por semana
    for (const row of weeks.rows) {
      // Encontrar a semana (domingo-sábado) a que pertence
      const dt = new Date(row.d);
      const weekStart = new Date(dt);
      weekStart.setDate(weekStart.getDate() - weekStart.getDay());
      semanasCompletas.add(weekStart.toISOString().slice(0, 10));
    }
    log(`Resume: ${semanasCompletas.size} semanas com dados (serão verificadas por contagem)`);
  }

  let totalInseridos = 0;
  let totalErros = 0;
  let totalDuplicados = 0;

  for (const mes of meses) {
    if (globalLimit && totalInseridos >= globalLimit) {
      log(`Limite global atingido: ${globalLimit}`);
      break;
    }

    // Se resume, verificar se a semana já tem dados suficientes
    if (resume && semanasCompletas.size > 0) {
      // Contar registros desta semana no banco
      try {
        const existing = await client.query(
          'SELECT count(*) as n FROM stj_datajud WHERE data_ajuizamento >= $1 AND data_ajuizamento <= $2',
          [mes.gte, mes.lte + 'T23:59:59Z']
        );
        const countQuery2 = { size: 0, query: { range: { dataAjuizamento: { gte: mes.gte, lte: mes.lte } } } };
        const apiCount = await searchDatajud(countQuery2);
        const apiTotal = apiCount.hits?.total?.value || 0;
        const dbTotal = parseInt(existing.rows[0].n);
        if (apiTotal > 0 && dbTotal >= apiTotal * 0.95) {
          log(`[SKIP] ${mes.label} — ${dbTotal}/${apiTotal} já extraídos (${(dbTotal/apiTotal*100).toFixed(0)}%)`);
          continue;
        }
      } catch (e) {
        // Se falhar a verificação, extrair de qualquer forma
      }
    }

    // Contar total do mês
    const countQuery = {
      size: 0,
      query: { range: { dataAjuizamento: { gte: mes.gte, lte: mes.lte } } }
    };
    let totalMes;
    try {
      const countResult = await searchDatajud(countQuery);
      totalMes = countResult.hits?.total?.value || 0;
    } catch (err) {
      log(`ERRO contagem ${mes.label}: ${err.message}`);
      totalErros++;
      continue;
    }

    if (totalMes === 0) {
      log(`[SKIP] ${mes.label} — 0 processos`);
      continue;
    }

    log(`[${mes.label}] ${totalMes} processos — iniciando extração`);

    let extraidos = 0;

    while (extraidos < totalMes) {
      if (globalLimit && totalInseridos >= globalLimit) break;

      const query = {
        size: BATCH_SIZE,
        from: extraidos,
        query: { range: { dataAjuizamento: { gte: mes.gte, lte: mes.lte } } },
        sort: ['_doc']
      };

      // API limita from+size a 10000
      if (extraidos + BATCH_SIZE > 10000) {
        log(`  [${mes.label}] Atingiu limite 10K — ${extraidos} extraídos de ${totalMes}`);
        break;
      }

      let result;
      let retries = 0;
      while (retries < 3) {
        try {
          result = await searchDatajud(query);
          break;
        } catch (err) {
          retries++;
          if (retries >= 3) {
            log(`ERRO ${mes.label} offset ${extraidos}: ${err.message.slice(0, 150)} — desistindo`);
            totalErros++;
            result = null;
          } else {
            await new Promise(r => setTimeout(r, 3000));
          }
        }
      }
      if (!result) break;

      const hits = result.hits?.hits || [];
      if (hits.length === 0) break;

      // Preparar registros e inserir em sub-batches de 50
      const COLS = 'numero_processo,classe_codigo,classe_nome,data_ajuizamento,relator,gabinete,orgao_julgador_codigo,assuntos,assuntos_json,ultima_fase,total_movimentos,decisoes_json,formato,grau,nivel_sigilo,data_ultima_atualizacao,movimentos_json';
      const allRecords = [];

      for (const hit of hits) {
        const s = hit._source;
        const { relator, gabinete } = extrairRelator(s.orgaoJulgador);
        const assuntosTxt = extrairAssuntos(s.assuntos);
        const ultimaFase = extrairUltimaFase(s.movimentos);
        const decisoes = extrairDecisoes(s.movimentos);

        // Converter data
        let dataAjuiz = null;
        if (s.dataAjuizamento) {
          const d = String(s.dataAjuizamento);
          const isoMatch = d.match(/^(\d{4}-\d{2}-\d{2})/);
          if (isoMatch) {
            dataAjuiz = isoMatch[1];
          } else {
            const compMatch = d.match(/^(\d{4})(\d{2})(\d{2})/);
            if (compMatch) dataAjuiz = `${compMatch[1]}-${compMatch[2]}-${compMatch[3]}`;
          }
          if (dataAjuiz && isNaN(Date.parse(dataAjuiz))) dataAjuiz = null;
        }

        allRecords.push([
          s.numeroProcesso, s.classe?.codigo, s.classe?.nome, dataAjuiz,
          relator, gabinete, s.orgaoJulgador?.codigo, assuntosTxt,
          JSON.stringify(s.assuntos || []), ultimaFase, s.movimentos?.length || 0,
          JSON.stringify(decisoes), s.formato?.nome, s.grau, s.nivelSigilo,
          s.dataHoraUltimaAtualizacao, JSON.stringify(s.movimentos || [])
        ]);
      }

      // Inserir em sub-batches de 50
      const SUB_BATCH = 50;
      for (let b = 0; b < allRecords.length; b += SUB_BATCH) {
        const chunk = allRecords.slice(b, b + SUB_BATCH);
        const rows = [];
        const params = [];
        let pi = 1;
        for (const vals of chunk) {
          rows.push(`(${vals.map(() => `$${pi++}`).join(',')})`);
          params.push(...vals);
        }
        try {
          const res = await client.query(`
            INSERT INTO stj_datajud (${COLS}) VALUES ${rows.join(',')}
            ON CONFLICT (numero_processo) DO UPDATE SET
              relator=EXCLUDED.relator, gabinete=EXCLUDED.gabinete,
              assuntos=EXCLUDED.assuntos, assuntos_json=EXCLUDED.assuntos_json,
              ultima_fase=EXCLUDED.ultima_fase, total_movimentos=EXCLUDED.total_movimentos,
              decisoes_json=EXCLUDED.decisoes_json, data_ultima_atualizacao=EXCLUDED.data_ultima_atualizacao,
              movimentos_json=EXCLUDED.movimentos_json
          `, params);
          totalInseridos += res.rowCount;
        } catch (err) {
          // Fallback um a um
          for (const vals of chunk) {
            try {
              await client.query(`INSERT INTO stj_datajud (${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
                ON CONFLICT (numero_processo) DO UPDATE SET relator=EXCLUDED.relator,gabinete=EXCLUDED.gabinete,assuntos=EXCLUDED.assuntos,assuntos_json=EXCLUDED.assuntos_json,ultima_fase=EXCLUDED.ultima_fase,total_movimentos=EXCLUDED.total_movimentos,decisoes_json=EXCLUDED.decisoes_json,data_ultima_atualizacao=EXCLUDED.data_ultima_atualizacao,movimentos_json=EXCLUDED.movimentos_json`, vals);
              totalInseridos++;
            } catch (e2) { totalErros++; }
          }
        }
      }

      extraidos += hits.length;

      if (extraidos % 2000 === 0 || extraidos >= totalMes) {
        log(`  [${mes.label}] ${extraidos}/${totalMes} (${(extraidos/totalMes*100).toFixed(1)}%) | total banco: ${totalInseridos} | erros: ${totalErros}`);
      }

      await new Promise(r => setTimeout(r, DELAY_MS));
    }

    log(`[${mes.label}] COMPLETO — ${extraidos} extraídos`);

    // Backup CSV a cada 50K inseridos
    if (totalInseridos % 50000 < BATCH_SIZE) {
      const count = await client.query('SELECT count(*) FROM stj_datajud');
      log(`Banco stj_datajud: ${count.rows[0].count} registros`);
    }
  }

  // Final
  log('\n=== EXTRAÇÃO COMPLETA ===');
  const finalCount = await client.query('SELECT count(*) FROM stj_datajud');
  log(`stj_datajud: ${finalCount.rows[0].count} registros`);
  log(`Inseridos: ${totalInseridos} | Duplicados: ${totalDuplicados} | Erros: ${totalErros}`);

  // Estatísticas
  const stats = await client.query(`
    SELECT classe_nome, count(*) as n
    FROM stj_datajud
    GROUP BY classe_nome
    ORDER BY n DESC
    LIMIT 10
  `);
  log('Top classes:');
  stats.rows.forEach(r => log(`  ${r.classe_nome}: ${r.n}`));

  // Backup CSV final
  const today = new Date().toISOString().slice(0, 10);
  const csvFile = path.join(BACKUP_DIR, `stj_datajud_stats_${today}.csv`);
  const statsAll = await client.query(`
    SELECT classe_nome, extract(year from data_ajuizamento) as ano, count(*) as n
    FROM stj_datajud
    GROUP BY classe_nome, ano
    ORDER BY ano DESC, n DESC
  `);
  const csvContent = 'classe,ano,n\n' + statsAll.rows.map(r => `${r.classe_nome},${r.ano},${r.n}`).join('\n');
  fs.writeFileSync(csvFile, csvContent, 'utf8');
  log(`CSV stats: ${csvFile}`);

  await client.end();
}

main().catch(e => { log(`FATAL: ${e.message}`); process.exit(1); });
