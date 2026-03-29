import fs from 'fs';
import path from 'path';

const DATAJUD_URL = 'https://api-publica.datajud.cnj.jus.br/api_publica_stj/_search';
const DATAJUD_KEY = 'cDZHYzlZa0JadVREZDJCendQbXY6SkJlTzNjLV9TRENyQk1RdnFKZGRQdw==';
const COLS = 'numero_processo,classe_codigo,classe_nome,data_ajuizamento,relator,gabinete,orgao_julgador_codigo,assuntos,ultima_fase,total_movimentos,formato,grau,nivel_sigilo,data_ultima_atualizacao';
const csvFile = path.join('C:', 'Users', 'medin', 'Desktop', 'backup_judx', 'resultados', 'stj_datajud', 'stj_datajud_sem_data.csv');

function esc(v) {
  if (v == null) return '';
  let s = String(v).replace(/"/g, '""');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) s = '"' + s + '"';
  return s;
}

function extrairRelator(orgao) {
  if (!orgao?.nome) return { relator: '', gabinete: '' };
  const g = orgao.nome.trim();
  let m = g.match(/GABINETE\s+D[OA]\s+MINISTR[OA]\s+(.+)/i);
  if (m) return { relator: m[1].trim(), gabinete: g };
  m = g.match(/(?:GABINETE\s+D[OA]\s+)?DESEMBARGADOR[A]?\s+CONVOCAD[OA]\s+(?:DO\s+\S+\s+)?(.+)/i);
  if (m) return { relator: 'DESEMB. CONV. ' + m[1].replace(/\s*\(.*$/, '').trim(), gabinete: g };
  if (/VICE.PRESID/i.test(g)) return { relator: 'VICE-PRESIDENTE STJ', gabinete: g };
  if (/PRESID.NCIA$/i.test(g)) return { relator: 'PRESIDENTE STJ', gabinete: g };
  return { relator: '', gabinete: g };
}

async function main() {
  fs.writeFileSync(csvFile, COLS + '\n');
  let from = 0, novos = 0;

  while (from < 10000) {
    const resp = await fetch(DATAJUD_URL, {
      method: 'POST',
      headers: { 'Authorization': `ApiKey ${DATAJUD_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        size: 2000, from,
        query: { bool: { must_not: { exists: { field: 'dataAjuizamento' } } } },
        sort: ['_doc']
      })
    });
    const data = await resp.json();
    const hits = data.hits?.hits || [];
    if (!hits.length) break;

    const lines = hits.map(h => {
      const s = h._source;
      const { relator, gabinete } = extrairRelator(s.orgaoJulgador);
      const assuntos = (s.assuntos || []).map(a => a.nome).join('; ');
      const movs = s.movimentos || [];
      const uf = movs.length ? [...movs].sort((a, b) => new Date(b.dataHora || 0) - new Date(a.dataHora || 0))[0]?.nome || '' : '';
      return [s.numeroProcesso, s.classe?.codigo || '', s.classe?.nome || '', '', relator, gabinete, s.orgaoJulgador?.codigo || '', assuntos, uf, movs.length || 0, s.formato?.nome || '', s.grau || '', s.nivelSigilo ?? '', s.dataHoraUltimaAtualizacao || ''].map(esc).join(',');
    });

    fs.appendFileSync(csvFile, lines.join('\n') + '\n');
    novos += hits.length;
    from += hits.length;
    console.log(`${novos} capturados...`);
    await new Promise(r => setTimeout(r, 100));
  }
  console.log(`COMPLETO: ${novos} processos sem data => ${csvFile}`);
}

main().catch(e => console.error(e.message));
