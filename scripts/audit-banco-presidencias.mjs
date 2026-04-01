import pg from 'pg';
import ExcelJS from 'exceljs';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
});

async function query(sql) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await pool.query(sql);
    } catch (e) {
      console.log(`  Query attempt ${attempt} failed: ${e.code || e.message}`);
      if (attempt === 3) throw e;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

// Períodos de presidência e vice-presidência do STF
const PRESIDENCIAS = [
  { inicio: '2010-04-23', fim: '2012-04-18', presidente: 'MIN. CEZAR PELUSO', vice: 'MIN. AYRES BRITTO' },
  { inicio: '2012-04-19', fim: '2012-11-18', presidente: 'MIN. AYRES BRITTO', vice: 'MIN. JOAQUIM BARBOSA' },
  { inicio: '2012-11-22', fim: '2014-07-01', presidente: 'MIN. JOAQUIM BARBOSA', vice: 'MIN. RICARDO LEWANDOWSKI' },
  { inicio: '2014-09-10', fim: '2016-05-12', presidente: 'MIN. RICARDO LEWANDOWSKI', vice: 'MIN. CÁRMEN LÚCIA' },
  { inicio: '2016-09-12', fim: '2018-09-13', presidente: 'MIN. CÁRMEN LÚCIA', vice: 'MIN. DIAS TOFFOLI' },
  { inicio: '2018-09-13', fim: '2020-09-10', presidente: 'MIN. DIAS TOFFOLI', vice: 'MIN. LUIZ FUX' },
  { inicio: '2020-09-10', fim: '2022-09-12', presidente: 'MIN. LUIZ FUX', vice: 'MIN. ROSA WEBER' },
  { inicio: '2022-09-12', fim: '2023-10-02', presidente: 'MIN. ROSA WEBER', vice: 'MIN. LUÍS ROBERTO BARROSO' },
  { inicio: '2023-10-02', fim: '2027-10-01', presidente: 'MIN. LUÍS ROBERTO BARROSO', vice: 'MIN. EDSON FACHIN' },
];

function parseDataDecisao(dd) {
  if (!dd) return null;
  const m = dd.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function resolverMinistro(relatorDecisao, dataDecisao) {
  if (relatorDecisao !== 'MINISTRO PRESIDENTE' && relatorDecisao !== 'VICE-PRESIDENTE') {
    return { ministro_real: relatorDecisao, cargo: null, periodo_presidencia: null };
  }
  const iso = parseDataDecisao(dataDecisao);
  if (!iso) return { ministro_real: relatorDecisao, cargo: relatorDecisao, periodo_presidencia: 'DATA_INVALIDA' };

  for (const p of PRESIDENCIAS) {
    if (iso >= p.inicio && iso <= p.fim) {
      const ministro = relatorDecisao === 'MINISTRO PRESIDENTE' ? p.presidente : p.vice;
      return {
        ministro_real: ministro,
        cargo: relatorDecisao === 'MINISTRO PRESIDENTE' ? 'PRESIDENTE' : 'VICE-PRESIDENTE',
        periodo_presidencia: `${p.inicio} a ${p.fim} (${p.presidente})`
      };
    }
  }
  return { ministro_real: relatorDecisao, cargo: relatorDecisao, periodo_presidencia: 'FORA_DE_PERIODO' };
}

async function run() {
  // pool connects automatically
  console.log('Conectado. Rodando queries...');

  // 1. Amostra de 50 processos com TODOS os campos
  const { rows: amostra } = await query(`
    SELECT id, processo, classe, orgao_julgador, relator_decisao, relator_atual,
           data_autuacao::text, data_decisao, data_baixa::text, grupo_origem, tipo_classe,
           ramo_direito, assunto, tipo_decisao, decisoes_virtual, ambiente_julgamento,
           indicador_colegiado, descricao_andamento,
           CASE WHEN observacao_andamento IS NOT NULL THEN 'SIM' ELSE 'NÃO' END as tem_observacao,
           CASE WHEN link_processo IS NOT NULL THEN 'SIM' ELSE 'NÃO' END as tem_link,
           cod_andamento, subgrupo_andamento, em_tramitacao, raw_source
    FROM stf_decisoes
    ORDER BY random()
    LIMIT 50
  `);
  console.log('  ✓ Amostra OK');

  // 2. Mapa de preenchimento
  const { rows: [preenchimento] } = await query(`
    SELECT
      COUNT(*) as total,
      COUNT(processo) as processo,
      COUNT(classe) as classe,
      COUNT(orgao_julgador) as orgao_julgador,
      COUNT(relator_decisao) as relator_decisao,
      COUNT(relator_atual) as relator_atual,
      COUNT(data_autuacao) as data_autuacao,
      COUNT(data_decisao) as data_decisao,
      COUNT(data_baixa) as data_baixa,
      COUNT(grupo_origem) as grupo_origem,
      COUNT(tipo_classe) as tipo_classe,
      COUNT(ramo_direito) as ramo_direito,
      COUNT(assunto) as assunto,
      COUNT(tipo_decisao) as tipo_decisao,
      COUNT(decisoes_virtual) as decisoes_virtual,
      COUNT(ambiente_julgamento) as ambiente_julgamento,
      COUNT(indicador_colegiado) as indicador_colegiado,
      COUNT(descricao_andamento) as descricao_andamento,
      COUNT(observacao_andamento) as observacao_andamento,
      COUNT(link_processo) as link_processo,
      COUNT(cod_andamento) as cod_andamento,
      COUNT(subgrupo_andamento) as subgrupo_andamento
    FROM stf_decisoes
  `);

  // 3. Relatores com contagem
  const { rows: relatores } = await query(`
    SELECT relator_decisao, COUNT(*) as total
    FROM stf_decisoes
    GROUP BY relator_decisao
    ORDER BY total DESC
  `);

  // 4. MINISTRO PRESIDENTE + VICE por ano
  const { rows: presidentePorAno } = await query(`
    SELECT
      SUBSTRING(data_decisao FROM '\\d{4}$')::int as ano,
      relator_decisao,
      COUNT(*) as total
    FROM stf_decisoes
    WHERE relator_decisao IN ('MINISTRO PRESIDENTE', 'VICE-PRESIDENTE')
    GROUP BY ano, relator_decisao
    ORDER BY ano, relator_decisao
  `);

  // 5. Amostra de decisões MINISTRO PRESIDENTE para testar resolução
  const { rows: amostraPres } = await query(`
    SELECT id, processo, relator_decisao, relator_atual, data_decisao,
           orgao_julgador, tipo_decisao, descricao_andamento
    FROM stf_decisoes
    WHERE relator_decisao IN ('MINISTRO PRESIDENTE', 'VICE-PRESIDENTE')
    ORDER BY random()
    LIMIT 100
  `);

  // 6. Inconsistências: data_baixa < data_autuacao
  const { rows: dataBaixaErro } = await query(`
    SELECT processo, data_autuacao::text, data_decisao, data_baixa::text
    FROM stf_decisoes
    WHERE data_baixa < data_autuacao
    LIMIT 50
  `);

  // 7. Inconsistências: registros 2026 sem campos-chave
  const { rows: registros2026 } = await query(`
    SELECT COUNT(*) as total,
      COUNT(classe) as com_classe,
      COUNT(relator_decisao) as com_relator_decisao,
      COUNT(grupo_origem) as com_grupo_origem,
      COUNT(link_processo) as com_link,
      COUNT(decisoes_virtual) as com_virtual
    FROM stf_decisoes
    WHERE SUBSTRING(data_decisao FROM '\\d{4}$')::int = 2026
  `);

  // 8. Duplicatas potenciais (mesmo processo + mesma data_decisao)
  const { rows: duplicatas } = await query(`
    SELECT processo, data_decisao, COUNT(*) as vezes
    FROM stf_decisoes
    GROUP BY processo, data_decisao
    HAVING COUNT(*) > 2
    ORDER BY vezes DESC
    LIMIT 30
  `);

  await pool.end();
  console.log('Queries completas. Gerando Excel...');

  // === GERAR EXCEL ===
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JudX Audit';
  wb.created = new Date();

  const headerStyle = {
    font: { bold: true, color: { argb: 'FFFFFFFF' } },
    fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2B4C7E' } },
    alignment: { horizontal: 'center' }
  };

  function addHeaders(ws, headers) {
    const row = ws.addRow(headers);
    row.eachCell(c => {
      c.font = headerStyle.font;
      c.fill = headerStyle.fill;
      c.alignment = headerStyle.alignment;
    });
    ws.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headers.length)}1` };
  }

  // --- ABA 1: Amostra de Processos ---
  const ws1 = wb.addWorksheet('Amostra 50 processos');
  const cols1 = ['processo','classe','orgao_julgador','relator_decisao','relator_atual',
    'data_autuacao','data_decisao','data_baixa','grupo_origem','tipo_classe',
    'ramo_direito','tipo_decisao','decisoes_virtual','ambiente_julgamento',
    'indicador_colegiado','descricao_andamento','tem_observacao','tem_link',
    'em_tramitacao','raw_source'];
  addHeaders(ws1, cols1);
  for (const r of amostra) {
    ws1.addRow(cols1.map(c => r[c] ?? ''));
  }
  ws1.columns.forEach(c => { c.width = 20; });

  // --- ABA 2: Mapa de Preenchimento ---
  const ws2 = wb.addWorksheet('Preenchimento Campos');
  addHeaders(ws2, ['Campo', 'Preenchidos', 'Total', '% Preenchido', 'Lacunas', 'Status']);
  const total = parseInt(preenchimento.total);
  for (const [campo, valor] of Object.entries(preenchimento)) {
    if (campo === 'total') continue;
    const v = parseInt(valor);
    const pct = ((v / total) * 100).toFixed(1);
    const lacunas = total - v;
    let status = 'OK';
    if (pct < 50) status = 'CRITICO';
    else if (pct < 85) status = 'ATENÇÃO';
    else if (pct < 100) status = 'LACUNA';
    ws2.addRow([campo, v, total, `${pct}%`, lacunas, status]);
  }
  ws2.columns.forEach(c => { c.width = 22; });

  // --- ABA 3: Relatores (com/sem duplicação) ---
  const ws3 = wb.addWorksheet('Relatores - Problema 13 Min');
  addHeaders(ws3, ['relator_decisao', 'total_decisoes', 'tipo', 'problema']);
  for (const r of relatores) {
    let tipo = 'ministro';
    let problema = '';
    if (r.relator_decisao === 'MINISTRO PRESIDENTE') {
      tipo = 'CARGO (não ministro)';
      problema = 'Conta como 12º ministro se não resolvido → infla contagem para 13';
    } else if (r.relator_decisao === 'VICE-PRESIDENTE') {
      tipo = 'CARGO (não ministro)';
      problema = 'Conta como 13º ministro se não resolvido';
    } else if (r.relator_decisao === 'NÃO SE APLICA') {
      tipo = 'PLACEHOLDER';
      problema = 'Sem relator real';
    } else if (r.relator_decisao === null) {
      tipo = 'NULL';
      problema = '24.722 registros (todos de 2026) sem relator_decisao';
    }
    ws3.addRow([r.relator_decisao ?? 'NULL', parseInt(r.total), tipo, problema]);
  }
  ws3.columns.forEach(c => { c.width = 30; });

  // --- ABA 4: Períodos de Presidência ---
  const ws4 = wb.addWorksheet('Períodos Presidência STF');
  addHeaders(ws4, ['Início', 'Fim', 'Presidente', 'Vice-Presidente', 'Decisões como MINISTRO PRESIDENTE', 'Decisões como VICE-PRESIDENTE']);
  for (const p of PRESIDENCIAS) {
    // Contar decisões nesse período
    const presCount = presidentePorAno.filter(r => r.relator_decisao === 'MINISTRO PRESIDENTE');
    const viceCount = presidentePorAno.filter(r => r.relator_decisao === 'VICE-PRESIDENTE');
    ws4.addRow([p.inicio, p.fim, p.presidente, p.vice, '', '']);
  }
  ws4.columns.forEach(c => { c.width = 30; });

  // --- ABA 5: Resolução MINISTRO PRESIDENTE → ministro real ---
  const ws5 = wb.addWorksheet('Resolução Presidente→Ministro');
  addHeaders(ws5, ['processo','relator_decisao','relator_atual','data_decisao',
    'MINISTRO_REAL','CARGO','PERIODO_PRESIDENCIA','orgao_julgador','tipo_decisao','descricao_andamento']);
  for (const r of amostraPres) {
    const { ministro_real, cargo, periodo_presidencia } = resolverMinistro(r.relator_decisao, r.data_decisao);
    ws5.addRow([r.processo, r.relator_decisao, r.relator_atual, r.data_decisao,
      ministro_real, cargo, periodo_presidencia, r.orgao_julgador, r.tipo_decisao, r.descricao_andamento]);
  }
  ws5.columns.forEach(c => { c.width = 25; });
  // Destacar colunas novas
  ws5.getColumn(5).eachCell((cell, row) => {
    if (row > 1) cell.font = { bold: true, color: { argb: 'FF008000' } };
  });
  ws5.getColumn(6).eachCell((cell, row) => {
    if (row > 1) cell.font = { bold: true, color: { argb: 'FF008000' } };
  });

  // --- ABA 6: Inconsistências ---
  const ws6 = wb.addWorksheet('Inconsistências');
  addHeaders(ws6, ['Tipo', 'Descrição', 'Qtd Afetada', 'Exemplo/Detalhe', 'Ação Sugerida']);

  ws6.addRow(['PRESIDENTE/VICE como relator',
    'MINISTRO PRESIDENTE e VICE-PRESIDENTE computados como se fossem ministros separados (13 em vez de 11)',
    '34.075', 'MINISTRO PRESIDENTE: 33.926 / VICE: 149',
    'Criar coluna ministro_real com resolução por período']);

  ws6.addRow(['NULL relator_decisao',
    'Registros de 2026 sem relator_decisao (fonte diferente)',
    '24.722', 'Todos de 2026. Também sem: classe, grupo_origem, link_processo, tipo_classe',
    'Enriquecer a partir do relator_atual ou fonte complementar']);

  ws6.addRow(['ambiente_julgamento vs decisoes_virtual',
    'ambiente_julgamento só preenchido em 24.722 registros (2026). decisoes_virtual cobre 85% do total',
    `${total - parseInt(preenchimento.ambiente_julgamento)} sem ambiente`,
    'Duas fontes com campos diferentes',
    'Unificar: usar decisoes_virtual como base e ambiente_julgamento como complemento 2026']);

  ws6.addRow(['data_baixa < data_autuacao',
    'Processos onde data de baixa é anterior à data de autuação',
    `${dataBaixaErro.length}+ encontrados`,
    dataBaixaErro.length > 0 ? `Ex: ${dataBaixaErro[0].processo}` : 'Nenhum',
    'Revisar — possível erro de registro na fonte']);

  ws6.addRow(['Duplicatas processo+data',
    'Mesmo processo com mesma data_decisao aparecendo 3+ vezes',
    `${duplicatas.length} combos`,
    duplicatas.length > 0 ? `Ex: ${duplicatas[0].processo} (${duplicatas[0].vezes}x)` : 'Nenhum',
    'Verificar se são decisões diferentes ou duplicação de carga']);

  ws6.addRow(['Registros 2026 incompletos',
    'Lote 2026 sem classe, grupo_origem, tipo_classe, link_processo, decisoes_virtual, subgrupo_andamento',
    '24.722',
    `com_classe: ${registros2026[0]?.com_classe}, com_link: ${registros2026[0]?.com_link}`,
    'Fonte 2026 tem formato diferente — precisa normalização']);

  ws6.columns.forEach(c => { c.width = 35; });

  // --- ABA 7: Presidente por Ano ---
  const ws7 = wb.addWorksheet('Presidente-Vice por Ano');
  addHeaders(ws7, ['Ano', 'Cargo', 'Total Decisões', 'Presidente do Período', 'Vice do Período']);
  for (const r of presidentePorAno) {
    const ano = parseInt(r.ano);
    // Encontrar quem era presidente naquele ano (aproximado pelo meio do ano)
    const mid = `${ano}-06-15`;
    const periodo = PRESIDENCIAS.find(p => mid >= p.inicio && mid <= p.fim);
    ws7.addRow([
      ano, r.relator_decisao, parseInt(r.total),
      periodo?.presidente ?? '?', periodo?.vice ?? '?'
    ]);
  }
  ws7.columns.forEach(c => { c.width = 25; });

  // Salvar
  const path = `C:/Users/medin/Desktop/backup_judx/resultados/2026-03-30_audit_banco_presidencias.xlsx`;
  await wb.xlsx.writeFile(path);
  console.log(`\n✓ Excel salvo em: ${path}`);
  console.log(`\nRESUMO:`);
  console.log(`- 7 abas: Amostra, Preenchimento, Relatores, Presidências, Resolução, Inconsistências, Presidente/Ano`);
  console.log(`- MINISTRO PRESIDENTE: 33.926 decisões (20% do corpus)`);
  console.log(`- VICE-PRESIDENTE: 149 decisões`);
  console.log(`- NULL relator: 24.722 (todos 2026)`);
  console.log(`- Total inconsistências mapeadas: 6 tipos`);
}

run().catch(e => { console.error(e); process.exit(1); });
