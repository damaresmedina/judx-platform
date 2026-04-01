import pg from 'pg';
import ExcelJS from 'exceljs';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:Zb9cHoRww7WxgT0C@db.ejwyguskoiraredinqmb.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
  max: 1,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 30000,
});

async function q(sql) {
  for (let i = 1; i <= 3; i++) {
    try { return (await pool.query(sql)).rows; }
    catch (e) { console.log(`  retry ${i}: ${e.code||e.message}`); if (i===3) throw e; await new Promise(r=>setTimeout(r,2000)); }
  }
}

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

function resolverMinistro(rel, dd) {
  if (rel !== 'MINISTRO PRESIDENTE' && rel !== 'VICE-PRESIDENTE') return { ministro_real: rel, cargo: null, periodo: null };
  if (!dd) return { ministro_real: rel, cargo: rel, periodo: 'SEM_DATA' };
  const m = dd.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { ministro_real: rel, cargo: rel, periodo: 'DATA_INVALIDA' };
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  for (const p of PRESIDENCIAS) {
    if (iso >= p.inicio && iso <= p.fim) {
      return {
        ministro_real: rel === 'MINISTRO PRESIDENTE' ? p.presidente : p.vice,
        cargo: rel === 'MINISTRO PRESIDENTE' ? 'PRESIDENTE' : 'VICE-PRESIDENTE',
        periodo: `${p.inicio} a ${p.fim}`
      };
    }
  }
  return { ministro_real: rel, cargo: rel, periodo: 'FORA_PERIODO' };
}

async function run() {
  console.log('=== AUDIT COMPLETO BANCO STF ===\n');

  // ====== QUERIES ======
  console.log('1/14 Amostra stf_decisoes...');
  const amostraDecisoes = await q(`
    SELECT processo, classe, orgao_julgador, relator_decisao, relator_atual,
      data_autuacao::text, data_decisao, data_baixa::text, grupo_origem, tipo_classe,
      ramo_direito, tipo_decisao, decisoes_virtual, ambiente_julgamento,
      indicador_colegiado, descricao_andamento, em_tramitacao,
      CASE WHEN observacao_andamento IS NOT NULL THEN 'SIM' ELSE 'NÃO' END as tem_observacao,
      CASE WHEN link_processo IS NOT NULL THEN 'SIM' ELSE 'NÃO' END as tem_link,
      cod_andamento, subgrupo_andamento, raw_source
    FROM stf_decisoes ORDER BY random() LIMIT 50`);

  console.log('2/14 Preenchimento stf_decisoes...');
  const [prDecisoes] = await q(`SELECT COUNT(*) as total,
    COUNT(processo) as processo, COUNT(classe) as classe, COUNT(orgao_julgador) as orgao_julgador,
    COUNT(relator_decisao) as relator_decisao, COUNT(relator_atual) as relator_atual,
    COUNT(data_autuacao) as data_autuacao, COUNT(data_decisao) as data_decisao,
    COUNT(data_baixa) as data_baixa, COUNT(grupo_origem) as grupo_origem,
    COUNT(tipo_classe) as tipo_classe, COUNT(ramo_direito) as ramo_direito,
    COUNT(assunto) as assunto, COUNT(tipo_decisao) as tipo_decisao,
    COUNT(decisoes_virtual) as decisoes_virtual, COUNT(ambiente_julgamento) as ambiente_julgamento,
    COUNT(indicador_colegiado) as indicador_colegiado, COUNT(descricao_andamento) as descricao_andamento,
    COUNT(observacao_andamento) as observacao_andamento, COUNT(link_processo) as link_processo,
    COUNT(cod_andamento) as cod_andamento, COUNT(subgrupo_andamento) as subgrupo_andamento
    FROM stf_decisoes`);

  console.log('3/14 Preenchimento stf_partes...');
  const [prPartes] = await q(`SELECT COUNT(*) as total,
    COUNT(DISTINCT incidente) as incidentes, COUNT(DISTINCT processo) as processos,
    COUNT(papel) as papel, COUNT(nome) as nome, COUNT(tipo) as tipo,
    COUNT(oab) as oab, COUNT(raw_source) as raw_source FROM stf_partes`);

  console.log('4/14 Preenchimento judx_case...');
  const [prCase] = await q(`SELECT COUNT(*) as total,
    COUNT(external_number) as external_number, COUNT(court_id) as court_id,
    COUNT(organ_id) as organ_id, COUNT(procedural_class_id) as procedural_class_id,
    COUNT(main_subject_id) as main_subject_id, COUNT(decided_at) as decided_at,
    COUNT(summary) as summary, COUNT(metadata) as metadata FROM judx_case`);

  console.log('5/14 Preenchimento judx_decision...');
  const [prDecision] = await q(`SELECT COUNT(*) as total,
    COUNT(case_id) as case_id, COUNT(decision_date) as decision_date,
    COUNT(kind) as kind, COUNT(result) as result,
    COUNT(session_environment) as session_environment, COUNT(metadata) as metadata
    FROM judx_decision`);

  console.log('6/14 Relatores...');
  const relatores = await q(`SELECT relator_decisao, COUNT(*) as total FROM stf_decisoes GROUP BY relator_decisao ORDER BY total DESC`);

  console.log('7/14 Classes...');
  const classes = await q(`SELECT classe, COUNT(*) as total FROM stf_decisoes GROUP BY classe ORDER BY total DESC`);

  console.log('8/14 Orgãos julgadores...');
  const orgaos = await q(`SELECT orgao_julgador, COUNT(*) as total FROM stf_decisoes GROUP BY orgao_julgador ORDER BY total DESC`);

  console.log('9/14 Resultados (descricao_andamento)...');
  const resultados = await q(`SELECT descricao_andamento, COUNT(*) as total FROM stf_decisoes GROUP BY descricao_andamento ORDER BY total DESC LIMIT 40`);

  console.log('10/14 Distribuição por ano...');
  const porAno = await q(`SELECT SUBSTRING(data_decisao FROM '\\d{4}$')::int as ano, COUNT(*) as total FROM stf_decisoes GROUP BY ano ORDER BY ano`);

  console.log('11/14 Papeis stf_partes...');
  const papeis = await q(`SELECT papel, COUNT(*) as total FROM stf_partes GROUP BY papel ORDER BY total DESC`);

  console.log('12/14 Duplicatas judx_decision...');
  const dupDecision = await q(`SELECT jc.external_number, jd.decision_date::text, jd.kind, jd.result, COUNT(*) as vezes
    FROM judx_decision jd JOIN judx_case jc ON jd.case_id = jc.id
    GROUP BY jc.external_number, jd.decision_date, jd.kind, jd.result HAVING COUNT(*) > 1
    ORDER BY vezes DESC LIMIT 30`);

  console.log('13/14 Inversão temporal data_baixa < data_decisao...');
  const inversoes = await q(`SELECT processo, data_autuacao::text, data_decisao, data_baixa::text
    FROM stf_decisoes WHERE data_baixa IS NOT NULL AND data_decisao IS NOT NULL
    AND data_baixa < TO_DATE(data_decisao, 'DD/MM/YYYY') LIMIT 50`);

  console.log('14/14 Amostra MINISTRO PRESIDENTE resolução...');
  const amostraPres = await q(`SELECT processo, relator_decisao, relator_atual, data_decisao,
    orgao_julgador, tipo_decisao, descricao_andamento FROM stf_decisoes
    WHERE relator_decisao IN ('MINISTRO PRESIDENTE','VICE-PRESIDENTE') ORDER BY random() LIMIT 100`);

  await pool.end();
  console.log('\nQueries OK. Gerando Excel...\n');

  // ====== GERAR EXCEL ======
  const wb = new ExcelJS.Workbook();
  wb.creator = 'JudX Audit Completo';
  wb.created = new Date();

  const HS = { font:{bold:true,color:{argb:'FFFFFFFF'}}, fill:{type:'pattern',pattern:'solid',fgColor:{argb:'FF1B3A5C'}}, alignment:{horizontal:'center'} };
  const WARN = { font:{bold:true,color:{argb:'FFCC0000'}} };
  const OK = { font:{color:{argb:'FF006600'}} };

  function hdr(ws, cols) {
    const row = ws.addRow(cols);
    row.eachCell(c => { c.font=HS.font; c.fill=HS.fill; c.alignment=HS.alignment; });
    ws.autoFilter = {from:'A1', to:`${String.fromCharCode(64+cols.length)}1`};
  }

  // --- 1. RESUMO EXECUTIVO ---
  const ws1 = wb.addWorksheet('RESUMO EXECUTIVO');
  hdr(ws1, ['Tabela','Registros','Campos Totais','Lacunas Críticas','Inconsistências','Status Geral']);
  ws1.addRow(['stf_decisoes', 169851, 22, '24.722 sem classe/relator (fonte e7a4)', '2.872 dups incidente+cod | 4.839 inversão temporal | 4.412 case órgão', 'REQUER LIMPEZA']);
  ws1.addRow(['stf_partes', 856416, 8, 'oab: 49.4% NULL (esperado)', '276 registros com papel sujo (nome no campo papel)', 'BOM']);
  ws1.addRow(['judx_case', prCase.total, 8, `55 sem subject | ${parseInt(prCase.total)-parseInt(prCase.summary)} sem summary`, '0 duplicatas external_number', 'BOM']);
  ws1.addRow(['judx_decision', prDecision.total, 6, '88% session_env=nao_informado', '47.973 combos duplicados (Inq 4921: 250 dups)', 'REQUER DEDUP']);
  ws1.addRow(['judx_organ', 15, 2, 'STJ organs misturados', 'Case inconsistency: "1ª Turma" vs "2ª TURMA"', 'REVISAR']);
  ws1.addRow(['judx_procedural_class', 343, '-', '-', '-', 'OK']);
  ws1.addRow(['judx_subject', 3364, '-', '-', '-', 'OK']);
  ws1.addRow(['judx_court', 2, '-', '-', '-', 'OK']);
  ws1.columns.forEach(c => { c.width = 30; });

  // --- 2. PREENCHIMENTO stf_decisoes ---
  const ws2 = wb.addWorksheet('Preenchimento stf_decisoes');
  hdr(ws2, ['Campo','Preenchidos','Total','%','Lacunas','Status','Nota']);
  const totalD = parseInt(prDecisoes.total);
  for (const [campo, val] of Object.entries(prDecisoes)) {
    if (campo==='total') continue;
    const v = parseInt(val), pct = (v/totalD*100).toFixed(1), lac = totalD-v;
    let st = 'OK', nota = '';
    if (pct<15) { st='CRÍTICO'; nota='Só fonte e7a4 (2026) tem este campo'; }
    else if (pct<85) { st='ATENÇÃO'; nota='Fonte e7a4 não preenche este campo'; }
    else if (pct<100) { st='LACUNA'; }
    if (campo==='ambiente_julgamento') nota='Só 24.722 registros (e7a4/2026)';
    if (campo==='indicador_colegiado') nota='Só 24.722 registros (e7a4/2026)';
    if (campo==='decisoes_virtual') nota='478 NULL além dos 24.722 e7a4';
    ws2.addRow([campo, v, totalD, `${pct}%`, lac, st, nota]);
  }
  ws2.columns.forEach(c => { c.width = 22; });

  // --- 3. PREENCHIMENTO stf_partes ---
  const ws3 = wb.addWorksheet('Preenchimento stf_partes');
  hdr(ws3, ['Campo','Preenchidos','Total','%','Lacunas','Nota']);
  const totalP = parseInt(prPartes.total);
  const partesMap = {
    incidentes_distintos: [prPartes.incidentes, 'Chave de join com stf_decisoes'],
    processos_distintos: [prPartes.processos, '1 incidente = 1 processo'],
    papel: [prPartes.papel, '100% — inclui 276 sujos'],
    nome: [prPartes.nome, '100%'],
    tipo: [prPartes.tipo, '100% — 4 categorias'],
    oab: [prPartes.oab, 'Esperado NULL em entes_publicos e PFs sem OAB'],
  };
  for (const [campo, [val, nota]] of Object.entries(partesMap)) {
    const v = parseInt(val), pct = campo.includes('distint') ? '-' : (v/totalP*100).toFixed(1)+'%';
    ws3.addRow([campo, v, totalP, pct, campo.includes('distint') ? '-' : totalP-v, nota]);
  }
  ws3.columns.forEach(c => { c.width = 22; });

  // --- 4. PREENCHIMENTO judx_case ---
  const ws4 = wb.addWorksheet('Preenchimento judx_case');
  hdr(ws4, ['Campo','Preenchidos','Total','%','Lacunas']);
  const totalC = parseInt(prCase.total);
  for (const [campo, val] of Object.entries(prCase)) {
    if (campo==='total') continue;
    const v = parseInt(val);
    ws4.addRow([campo, v, totalC, (v/totalC*100).toFixed(1)+'%', totalC-v]);
  }
  ws4.columns.forEach(c => { c.width = 22; });

  // --- 5. PREENCHIMENTO judx_decision ---
  const ws5 = wb.addWorksheet('Preenchimento judx_decision');
  hdr(ws5, ['Campo','Preenchidos','Total','%','Lacunas']);
  const totalJD = parseInt(prDecision.total);
  for (const [campo, val] of Object.entries(prDecision)) {
    if (campo==='total') continue;
    const v = parseInt(val);
    ws5.addRow([campo, v, totalJD, (v/totalJD*100).toFixed(1)+'%', totalJD-v]);
  }
  ws5.columns.forEach(c => { c.width = 22; });

  // --- 6. RELATORES ---
  const ws6 = wb.addWorksheet('Relatores');
  hdr(ws6, ['relator_decisao','total','%_corpus','tipo','problema']);
  for (const r of relatores) {
    let tipo='ministro', prob='';
    if (r.relator_decisao==='MINISTRO PRESIDENTE') { tipo='CARGO'; prob='20% corpus — infla para 12º ministro'; }
    else if (r.relator_decisao==='VICE-PRESIDENTE') { tipo='CARGO'; prob='Infla para 13º ministro'; }
    else if (r.relator_decisao==='NÃO SE APLICA') { tipo='PLACEHOLDER'; prob='Sem relator'; }
    else if (r.relator_decisao===null) { tipo='NULL'; prob='24.722 registros (e7a4/2026)'; }
    ws6.addRow([r.relator_decisao??'NULL', +r.total, (+r.total/totalD*100).toFixed(1)+'%', tipo, prob]);
  }
  ws6.columns.forEach(c => { c.width = 28; });

  // --- 7. CLASSES PROCESSUAIS ---
  const ws7 = wb.addWorksheet('Classes Processuais');
  hdr(ws7, ['classe','total','%_corpus']);
  for (const r of classes) ws7.addRow([r.classe??'NULL', +r.total, (+r.total/totalD*100).toFixed(1)+'%']);
  ws7.columns.forEach(c => { c.width = 20; });

  // --- 8. ÓRGÃOS JULGADORES ---
  const ws8 = wb.addWorksheet('Órgãos Julgadores');
  hdr(ws8, ['orgao_julgador','total','%_corpus','problema']);
  for (const r of orgaos) {
    let prob = '';
    if (r.orgao_julgador==='1ª TURMA') prob='Duplicata case: "1ª Turma" vs "1ª TURMA"';
    if (r.orgao_julgador==='2ª TURMA') prob='Duplicata case: "2ª Turma" vs "2ª TURMA"';
    if (r.orgao_julgador==='TRIBUNAL PLENO') prob='Duplicata case: "Tribunal Pleno" vs "TRIBUNAL PLENO"';
    if (r.orgao_julgador==='PLENÁRIO VIRTUAL - RG') prob='Duplicata case com "Plenário Virtual - RG"';
    ws8.addRow([r.orgao_julgador, +r.total, (+r.total/totalD*100).toFixed(1)+'%', prob]);
  }
  ws8.columns.forEach(c => { c.width = 28; });

  // --- 9. RESULTADOS (descricao_andamento) ---
  const ws9 = wb.addWorksheet('Resultados Top 40');
  hdr(ws9, ['descricao_andamento','total','%_corpus','merito_ou_nao']);
  for (const r of resultados) {
    const sem = ['Agravo regimental não provido','Embargos rejeitados','Negado seguimento',
      'Agravo regimental não conhecido','Embargos não conhecidos','Não conhecido(s)',
      'Determinada a devolução pelo regime da repercussão geral','Determinada a devolução',
      'Embargos recebidos como agravo regimental desde logo não provido','Prejudicado'];
    const eh = sem.includes(r.descricao_andamento) ? 'SEM MÉRITO' : 'COM MÉRITO / OUTRO';
    ws9.addRow([r.descricao_andamento, +r.total, (+r.total/totalD*100).toFixed(1)+'%', eh]);
  }
  ws9.columns.forEach(c => { c.width = 30; });

  // --- 10. DISTRIBUIÇÃO POR ANO ---
  const ws10 = wb.addWorksheet('Decisões por Ano');
  hdr(ws10, ['ano','total_decisoes','fonte_principal','nota']);
  for (const r of porAno) {
    const ano = +r.ano;
    let fonte = '372e', nota = '';
    if (ano===2026) { fonte='e7a4'; nota='Fonte diferente — campos incompletos'; }
    else if (ano<2016) nota = 'Poucas decisões — corpus parcial antes de 2016';
    ws10.addRow([ano, +r.total, fonte, nota]);
  }
  ws10.columns.forEach(c => { c.width = 22; });

  // --- 11. PAPEIS stf_partes ---
  const ws11 = wb.addWorksheet('Papéis stf_partes');
  hdr(ws11, ['papel','total','%','tipo','problema']);
  const limpos = ['ADV','PROC','IMPTE','INTDO','PACTE','COATOR','PROCURADOR-GERAL DA REPÚBLICA',
    'ADVOGADO-GERAL DA UNIÃO','REQTE','IMPDO','REU','AUTOR','REQDO','ASSIST'];
  for (const r of papeis) {
    const limpo = limpos.includes(r.papel);
    ws11.addRow([r.papel, +r.total, (+r.total/totalP*100).toFixed(2)+'%',
      limpo?'LIMPO':'SUJO', limpo?'':'Nome de pessoa no campo papel']);
  }
  ws11.columns.forEach(c => { c.width = 25; });

  // --- 12. DUPLICATAS judx_decision ---
  const ws12 = wb.addWorksheet('Duplicatas judx_decision');
  hdr(ws12, ['processo','decision_date','kind','result','vezes_repetido']);
  for (const r of dupDecision) ws12.addRow([r.external_number, r.decision_date, r.kind, r.result, +r.vezes]);
  ws12.addRow([]);
  ws12.addRow(['TOTAL COMBOS DUPLICADOS:', 47973, '', '', 'Inq 4921 concentra maioria']);
  ws12.columns.forEach(c => { c.width = 22; });

  // --- 13. INVERSÕES TEMPORAIS ---
  const ws13 = wb.addWorksheet('Inversões Temporais');
  hdr(ws13, ['processo','data_autuacao','data_decisao','data_baixa','problema']);
  for (const r of inversoes) ws13.addRow([r.processo, r.data_autuacao, r.data_decisao, r.data_baixa, 'data_baixa < data_decisao']);
  ws13.addRow([]);
  ws13.addRow(['TOTAL INVERSÕES:', 4839]);
  ws13.columns.forEach(c => { c.width = 22; });

  // --- 14. RESOLUÇÃO PRESIDENTE → MINISTRO ---
  const ws14 = wb.addWorksheet('Resolução Presidente→Min');
  hdr(ws14, ['processo','relator_decisao','data_decisao','MINISTRO_REAL','CARGO','PERIODO','orgao_julgador','descricao_andamento']);
  for (const r of amostraPres) {
    const {ministro_real, cargo, periodo} = resolverMinistro(r.relator_decisao, r.data_decisao);
    ws14.addRow([r.processo, r.relator_decisao, r.data_decisao, ministro_real, cargo, periodo, r.orgao_julgador, r.descricao_andamento]);
  }
  ws14.columns.forEach(c => { c.width = 25; });
  ws14.getColumn(4).eachCell((c,i)=>{ if(i>1) c.font={bold:true,color:{argb:'FF008000'}}; });

  // --- 15. PERÍODOS PRESIDÊNCIA ---
  const ws15 = wb.addWorksheet('Períodos Presidência STF');
  hdr(ws15, ['Início','Fim','Presidente','Vice-Presidente']);
  for (const p of PRESIDENCIAS) ws15.addRow([p.inicio, p.fim, p.presidente, p.vice]);
  ws15.columns.forEach(c => { c.width = 30; });

  // --- 16. INCONSISTÊNCIAS CONSOLIDADAS ---
  const ws16 = wb.addWorksheet('INCONSISTÊNCIAS');
  hdr(ws16, ['#','Tipo','Tabela','Qtd Afetada','Severidade','Descrição','Ação Sugerida']);
  const incs = [
    [1,'PRESIDENTE/VICE como relator','stf_decisoes','34.075 (20%)','ALTA',
      'MINISTRO PRESIDENTE (33.926) e VICE-PRESIDENTE (149) contados como ministros separados, inflando contagem para 13',
      'Criar coluna ministro_real via mapeamento período+data'],
    [2,'Fonte e7a4 incompleta','stf_decisoes','24.722 (14.5%)','ALTA',
      'Registros 2026 sem: classe, relator_decisao, grupo_origem, tipo_classe, link_processo, decisoes_virtual, subgrupo_andamento',
      'Enriquecer via relator_atual / Corte Aberta, ou marcar como fonte separada'],
    [3,'Duplicatas judx_decision','judx_decision','47.973 combos','ALTA',
      'Mesmo case+date+kind+result repetidos. Inq 4921 sozinho tem 250 cópias numa data',
      'Deduplicar: manter 1 por combo, deletar excedentes'],
    [4,'Duplicatas stf_decisoes','stf_decisoes','2.872 combos','MÉDIA',
      'Mesmo incidente+cod_andamento aparecendo mais de 1x',
      'Investigar se são decisões distintas ou carga duplicada'],
    [5,'Inversão temporal','stf_decisoes','4.839','MÉDIA',
      'data_baixa anterior a data_decisao — impossível cronologicamente',
      'Marcar como inconsistência da fonte. Não usar data_baixa nesses registros'],
    [6,'Case orgao_julgador','stf_decisoes','4.412','BAIXA',
      '"1ª Turma" vs "1ª TURMA", "2ª Turma" vs "2ª TURMA", "Tribunal Pleno" vs "TRIBUNAL PLENO"',
      'Normalizar para versão capitalizada padrão'],
    [7,'Papéis sujos','stf_partes','276','BAIXA',
      'Nomes de advogados no campo papel: ADVDATAS, ADVANIR MARY SAMPAIO, ADVA ANTONIO...',
      'Reclassificar como ADV'],
    [8,'session_environment inútil','judx_decision','199.092 (88%)','MÉDIA',
      '88% marcado como nao_informado. Campo quase vazio',
      'Enriquecer a partir de stf_decisoes.decisoes_virtual'],
    [9,'ramo_direito com path completo','stf_decisoes','~25K (e7a4)','MÉDIA',
      'Fonte e7a4 tem ramo_direito com assunto completo (ex: "DIREITO PENAL | PARTE GERAL | APLICAÇÃO DA PENA")',
      'Separar: usar só 1º nível como ramo_direito'],
    [10,'judx_case sem summary','judx_case',`${parseInt(prCase.total)-parseInt(prCase.summary)}`,'BAIXA',
      'Cases sem texto de resumo/ementa',
      'Preencher a partir de observacao_andamento de stf_decisoes'],
    [11,'NULL relator_decisao','stf_decisoes','24.722','ALTA',
      'Todos de fonte e7a4. relator_atual está preenchido mas relator_decisao não',
      'Copiar relator_atual → relator_decisao quando NULL'],
    [12,'judx_organ mistura STF/STJ','judx_organ','15 registros','BAIXA',
      'CORTE ESPECIAL, PRIMEIRA SEÇÃO etc. são do STJ. Mesma tabela para ambos',
      'Aceitar — tabela serve ambos os tribunais'],
  ];
  for (const i of incs) ws16.addRow(i);
  ws16.columns.forEach(c => { c.width = 30; });
  ws16.getColumn(5).eachCell((c,i) => {
    if(i<=1) return;
    if(c.value==='ALTA') c.font={bold:true,color:{argb:'FFCC0000'}};
    else if(c.value==='MÉDIA') c.font={bold:true,color:{argb:'FFCC6600'}};
    else c.font={color:{argb:'FF006600'}};
  });

  // --- 17. AMOSTRA PROCESSOS ---
  const ws17 = wb.addWorksheet('Amostra 50 stf_decisoes');
  const cols = Object.keys(amostraDecisoes[0]||{});
  hdr(ws17, cols);
  for (const r of amostraDecisoes) ws17.addRow(cols.map(c => r[c] ?? ''));
  ws17.columns.forEach(c => { c.width = 18; });

  // === SALVAR ===
  const path = 'C:/Users/medin/Desktop/backup_judx/resultados/2026-03-30_audit_completo_stf.xlsx';
  await wb.xlsx.writeFile(path);

  console.log(`✓ Excel salvo: ${path}`);
  console.log(`\n=== RESUMO DO AUDIT ===`);
  console.log(`17 abas | 6 tabelas auditadas | 12 inconsistências mapeadas`);
  console.log(`\nINCONSISTÊNCIAS POR SEVERIDADE:`);
  console.log(`  ALTA:  4 (presidente/vice, fonte e7a4, dups judx_decision, NULL relator)`);
  console.log(`  MÉDIA: 4 (dups stf_decisoes, inversão temporal, session_env, ramo path)`);
  console.log(`  BAIXA: 4 (case órgão, papéis sujos, sem summary, organ STF/STJ)`);
}

run().catch(e => { console.error(e); process.exit(1); });
