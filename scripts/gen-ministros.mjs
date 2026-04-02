import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://ejwyguskoiraredinqmb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqd3lndXNrb2lyYXJlZGlucW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjI5NjcsImV4cCI6MjA4OTU5ODk2N30.YJvuOqXThPk_XQLLY63Cy-5KlJUQMQX0aZMjXke0x8s';

const dir = 'C:/Users/medin/projetos/judx-platform/public/taxa_provimento';

const ministros = [
  { nome: 'Alexandre de Moraes', relator: 'MIN. ALEXANDRE DE MORAES', slug: 'moraes', ini: 'AM', pct: 6.6, total: 8026, role: '1\u00aa Turma', foto: 'moraes.jpg', posse: 2017 },
  { nome: 'Fl\u00e1vio Dino', relator: 'MIN. FL\u00c1VIO DINO', slug: 'dino', ini: 'FD', pct: 5.9, total: 2190, role: '1\u00aa Turma', foto: 'dino.jpg', posse: 2024 },
  { nome: 'Lu\u00eds Roberto Barroso', relator: 'MIN. LU\u00cdS ROBERTO BARROSO', slug: 'barroso', ini: 'LRB', pct: 5.5, total: 7850, role: 'Presidente', foto: 'barroso.jpg', posse: 2013 },
  { nome: 'Edson Fachin', relator: 'MIN. EDSON FACHIN', slug: 'fachin', ini: 'EF', pct: 4.8, total: 8542, role: '1\u00aa Turma', foto: 'fachin.jpg', posse: 2015 },
  { nome: 'Andr\u00e9 Mendon\u00e7a', relator: 'MIN. ANDR\u00c9 MENDON\u00c7A', slug: 'andre-mendonca', ini: 'AM', pct: 4.2, total: 3948, role: '2\u00aa Turma', foto: 'andre.jpg', posse: 2021 },
  { nome: 'Nunes Marques', relator: 'MIN. NUNES MARQUES', slug: 'nunes-marques', ini: 'NM', pct: 4.0, total: 5465, role: '2\u00aa Turma', foto: 'nunes.jpg', posse: 2020 },
  { nome: 'Gilmar Mendes', relator: 'MIN. GILMAR MENDES', slug: 'gilmar-mendes', ini: 'GM', pct: 3.0, total: 9696, role: '2\u00aa Turma', foto: 'gilmar.jpg', posse: 2002 },
  { nome: 'C\u00e1rmen L\u00facia', relator: 'MIN. C\u00c1RMEN L\u00daCIA', slug: 'carmen-lucia', ini: 'CL', pct: 3.0, total: 8370, role: '1\u00aa Turma', foto: 'carmen.jpg', posse: 2006 },
  { nome: 'Cristiano Zanin', relator: 'MIN. CRISTIANO ZANIN', slug: 'zanin', ini: 'CZ', pct: 2.6, total: 3499, role: '1\u00aa Turma', foto: 'zanin.jpg', posse: 2023 },
  { nome: 'Dias Toffoli', relator: 'MIN. DIAS TOFFOLI', slug: 'toffoli', ini: 'DT', pct: 2.4, total: 8686, role: '2\u00aa Turma', foto: 'toffoli.jpg', posse: 2009 },
  { nome: 'Luiz Fux', relator: 'MIN. LUIZ FUX', slug: 'fux', ini: 'LF', pct: 1.9, total: 8357, role: '2\u00aa Turma', foto: 'fux.jpg', posse: 2011 },
];

const AVG = 3.8;

function gerarPagina(m) {
  const cor = m.pct >= AVG ? '#c8922a' : '#e05252';
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${m.nome} \u00b7 Taxa de Provimento \u00b7 JUDX</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --navy: #0d1f35;
  --navy-light: #112540;
  --gold: #c8922a;
  --gold-light: #e8b84b;
  --cream: #f5f0e8;
  --text-muted: #7a9bb5;
  --card-bg: #0a1628;
  --card-border: rgba(200,146,42,0.15);
}
* { margin:0; padding:0; box-sizing:border-box; }
body { background:var(--navy); color:#fff; font-family:'DM Sans',sans-serif; line-height:1.6; min-height:100vh; }

.header { display:flex; justify-content:space-between; align-items:center; padding:1.2rem 2.5rem; border-bottom:1px solid var(--card-border); }
.logo { color:var(--gold); font-size:0.75rem; letter-spacing:0.15em; font-weight:500; text-decoration:none; }
.back { color:var(--text-muted); font-size:0.8rem; text-decoration:none; transition:color 0.2s; }
.back:hover { color:var(--gold); }

.hero-minister {
  display:grid; grid-template-columns:auto 1fr; gap:2.5rem;
  padding:3rem 2.5rem 2rem; align-items:center;
  border-bottom:1px solid var(--card-border);
  background:linear-gradient(180deg,#0a1628 0%,var(--navy) 100%);
}
.hero-photo { width:140px; height:140px; border-radius:50%; overflow:hidden; border:3px solid rgba(200,146,42,0.4); }
.hero-photo img { width:100%; height:100%; object-fit:cover; object-position:top; }
.hero-info h1 { font-family:'Playfair Display',serif; font-size:2.2rem; font-weight:900; margin-bottom:0.3rem; }
.hero-info .role { color:var(--text-muted); font-size:0.85rem; margin-bottom:1rem; }
.hero-info .pct { font-family:'Playfair Display',serif; font-size:3rem; font-weight:900; color:${cor}; }
.hero-info .pct-label { color:var(--text-muted); font-size:0.75rem; letter-spacing:0.1em; }
.hero-info .total-label { color:var(--text-muted); font-size:0.8rem; margin-top:0.5rem; }

.content { max-width:1100px; margin:0 auto; padding:2rem 2.5rem; }

.section-title {
  font-family:'Playfair Display',serif; font-size:1.2rem; font-weight:700;
  margin-bottom:1rem; padding-bottom:0.5rem;
  border-bottom:1px solid var(--card-border);
  color:var(--gold);
}

.grid-stats {
  display:grid; grid-template-columns:repeat(auto-fit,minmax(200px,1fr));
  gap:1rem; margin-bottom:2.5rem;
}
.stat-card {
  background:var(--card-bg); border:1px solid var(--card-border);
  padding:1.2rem; border-radius:4px;
}
.stat-card .label { color:var(--text-muted); font-size:0.7rem; letter-spacing:0.1em; margin-bottom:0.3rem; }
.stat-card .value { font-family:'DM Mono',monospace; font-size:1.4rem; font-weight:500; }
.stat-card .value.gold { color:var(--gold); }
.stat-card .value.red { color:#e05252; }

.chart-container { margin-bottom:2.5rem; }
.bar-row { display:flex; align-items:center; gap:0.8rem; margin-bottom:0.6rem; }
.bar-label { width:120px; font-size:0.75rem; color:var(--text-muted); text-align:right; flex-shrink:0; }
.bar-track { flex:1; height:24px; background:rgba(255,255,255,0.05); border-radius:2px; overflow:hidden; position:relative; }
.bar-fill { height:100%; border-radius:2px; transition:width 0.6s ease; display:flex; align-items:center; padding-left:8px; }
.bar-fill span { font-family:'DM Mono',monospace; font-size:0.7rem; color:#fff; }

.table-section { margin-bottom:2.5rem; }
.data-table { width:100%; border-collapse:collapse; }
.data-table th { text-align:left; color:var(--text-muted); font-size:0.7rem; letter-spacing:0.1em; padding:0.6rem 0.8rem; border-bottom:1px solid var(--card-border); }
.data-table td { padding:0.6rem 0.8rem; font-size:0.8rem; border-bottom:1px solid rgba(255,255,255,0.05); }
.data-table tr:hover { background:rgba(200,146,42,0.05); }

.loading { text-align:center; color:var(--text-muted); padding:2rem; font-size:0.85rem; }

@media(max-width:700px) {
  .hero-minister { grid-template-columns:1fr; text-align:center; justify-items:center; gap:1rem; padding:2rem 1.2rem; }
  .hero-photo { width:100px; height:100px; }
  .content { padding:1.5rem 1.2rem; }
  .bar-label { width:80px; font-size:0.65rem; }
}
</style>
</head>
<body>

<header class="header">
  <a href="/taxa_provimento/" class="logo">JUDX \u00b7 Intelig\u00eancia Jurisprudencial</a>
  <a href="/taxa_provimento/" class="back">\u2190 Voltar ao painel</a>
</header>

<section class="hero-minister">
  <div class="hero-photo">
    <img src="/ministros/${m.foto}" alt="${m.nome}" onerror="this.style.display='none';this.parentElement.textContent='${m.ini}'">
  </div>
  <div class="hero-info">
    <div class="pct-label">TAXA DE PROVIMENTO</div>
    <div class="pct">${m.pct.toFixed(1)}%</div>
    <h1>${m.nome}</h1>
    <div class="role">${m.role} \u00b7 STF \u00b7 Posse em ${m.posse}</div>
    <div class="total-label" id="hero-total">Carregando decis\u00f5es...</div>
  </div>
</section>

<div class="content">

  <div class="grid-stats" id="stats">
    <div class="stat-card"><div class="label">TOTAL DECIS\u00d5ES</div><div class="value" id="s-total">...</div></div>
    <div class="stat-card"><div class="label">PROVIDOS</div><div class="value gold" id="s-provido">...</div></div>
    <div class="stat-card"><div class="label">N\u00c3O PROVIDOS</div><div class="value" id="s-nao-provido">...</div></div>
    <div class="stat-card"><div class="label">PARCIALMENTE PROVIDOS</div><div class="value" id="s-parcial">...</div></div>
    <div class="stat-card"><div class="label">N\u00c3O CONHECIDOS</div><div class="value red" id="s-nao-conhecido">...</div></div>
    <div class="stat-card"><div class="label">M\u00c9DIA PONDERADA STF</div><div class="value" style="color:var(--text-muted)" id="s-media">...</div></div>
  </div>

  <div class="chart-container">
    <h2 class="section-title">Evolu\u00e7\u00e3o por Ano</h2>
    <div id="chart-anos" class="loading">Carregando dados do Supabase...</div>
  </div>

  <div class="chart-container">
    <h2 class="section-title">Por Ramo do Direito</h2>
    <div id="chart-ramos" class="loading">Carregando...</div>
  </div>

  <div class="table-section">
    <h2 class="section-title">Top Assuntos</h2>
    <div id="table-assuntos" class="loading">Carregando...</div>
  </div>

</div>

<script>
const SUPA_URL = '${SUPABASE_URL}';
const SUPA_KEY = '${SUPABASE_KEY}';
const RELATOR = '${m.relator}';
const ANO_POSSE = ${m.posse};
const hdrs = { apikey: SUPA_KEY, Authorization: 'Bearer ' + SUPA_KEY };

async function fetchPaginated(baseUrl) {
  let all = [], offset = 0;
  while (true) {
    const res = await fetch(baseUrl + '&limit=10000&offset=' + offset, { headers: hdrs });
    const data = await res.json();
    all = all.concat(data);
    if (data.length < 10000) break;
    offset += 10000;
  }
  return all;
}

async function main() {
  // Fetch minister data (filtered by posse year)
  const minUrl = SUPA_URL + '/rest/v1/v_provimento_merito'
    + '?select=categoria_provimento,ramo_direito,assunto_principal,ano'
    + '&relator=eq.' + encodeURIComponent(RELATOR)
    + '&ano=gte.' + ANO_POSSE;

  // Fetch ALL ministers data for weighted average (same period as this minister)
  const allUrl = SUPA_URL + '/rest/v1/v_provimento_merito'
    + '?select=categoria_provimento'
    + '&ano=gte.' + ANO_POSSE;

  const [dados, todosSTF] = await Promise.all([
    fetchPaginated(minUrl),
    fetchPaginated(allUrl)
  ]);

  // Weighted average: providos / total decisoes de merito (all STF, same period)
  let stfProvido = 0, stfBase = 0;
  todosSTF.forEach(r => {
    if (['provido','nao_provido','parcial'].includes(r.categoria_provimento)) {
      stfBase++;
      if (r.categoria_provimento === 'provido') stfProvido++;
    }
  });
  const mediaSTF = stfBase > 0 ? ((stfProvido / stfBase) * 100).toFixed(1) : '0';

  // Minister stats
  let provido=0, nao_provido=0, parcial=0, nao_conhecido=0;
  const porAno = {}, porRamo = {}, porAssunto = {};

  dados.forEach(r => {
    if (r.categoria_provimento === 'provido') provido++;
    else if (r.categoria_provimento === 'nao_provido') nao_provido++;
    else if (r.categoria_provimento === 'parcial') parcial++;
    else if (r.categoria_provimento === 'nao_conhecido') nao_conhecido++;

    const ano = r.ano || 'N/I';
    if (!porAno[ano]) porAno[ano] = {t:0,p:0};
    porAno[ano].t++;
    if (r.categoria_provimento === 'provido') porAno[ano].p++;

    const ramo = r.ramo_direito || 'N\u00e3o informado';
    if (!porRamo[ramo]) porRamo[ramo] = {t:0,p:0};
    porRamo[ramo].t++;
    if (r.categoria_provimento === 'provido') porRamo[ramo].p++;

    const assunto = r.assunto_principal || 'N\u00e3o informado';
    if (!porAssunto[assunto]) porAssunto[assunto] = {t:0,p:0};
    porAssunto[assunto].t++;
    if (r.categoria_provimento === 'provido') porAssunto[assunto].p++;
  });

  // Individual weighted rate
  const base = provido + nao_provido + parcial;
  const taxaIndiv = base > 0 ? ((provido / base) * 100).toFixed(1) : '0';

  // Update hero
  document.getElementById('hero-total').textContent = dados.length.toLocaleString('pt-BR')
    + ' decis\u00f5es colegiadas de m\u00e9rito (' + ANO_POSSE + '\u2013' + new Date().getFullYear() + ')';
  document.querySelector('.pct').textContent = taxaIndiv + '%';
  document.querySelector('.pct').style.color = parseFloat(taxaIndiv) >= parseFloat(mediaSTF) ? '#c8922a' : '#e05252';

  // Stats
  document.getElementById('s-total').textContent = dados.length.toLocaleString('pt-BR');
  document.getElementById('s-provido').textContent = provido.toLocaleString('pt-BR');
  document.getElementById('s-nao-provido').textContent = nao_provido.toLocaleString('pt-BR');
  document.getElementById('s-parcial').textContent = parcial.toLocaleString('pt-BR');
  document.getElementById('s-nao-conhecido').textContent = nao_conhecido.toLocaleString('pt-BR');
  document.getElementById('s-media').textContent = mediaSTF + '%';

  // Chart Anos (only from posse year)
  const anos = Object.keys(porAno).filter(a => a !== 'N/I' && parseInt(a) >= ANO_POSSE).sort();
  const maxAnoT = Math.max(...anos.map(a => porAno[a].t));
  document.getElementById('chart-anos').innerHTML = anos.map(a => {
    const taxa = porAno[a].t > 0 ? ((porAno[a].p / porAno[a].t) * 100).toFixed(1) : '0';
    const w = Math.round((porAno[a].t / maxAnoT) * 100);
    const c = parseFloat(taxa) >= parseFloat(mediaSTF) ? 'var(--gold)' : '#e05252';
    return '<div class="bar-row">'
      + '<div class="bar-label">' + a + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+w+'%;background:'+c+'"><span>'+taxa+'% ('+porAno[a].t+')</span></div></div>'
      + '</div>';
  }).join('');

  // Chart Ramos
  const ramosArr = Object.entries(porRamo).sort((a,b) => b[1].t - a[1].t).slice(0,8);
  const maxRamoT = ramosArr.length > 0 ? ramosArr[0][1].t : 1;
  document.getElementById('chart-ramos').innerHTML = ramosArr.map(([ramo, v]) => {
    const taxa = v.t > 0 ? ((v.p / v.t) * 100).toFixed(1) : '0';
    const w = Math.round((v.t / maxRamoT) * 100);
    const c = parseFloat(taxa) >= parseFloat(mediaSTF) ? 'var(--gold)' : '#e05252';
    return '<div class="bar-row">'
      + '<div class="bar-label">' + ramo + '</div>'
      + '<div class="bar-track"><div class="bar-fill" style="width:'+w+'%;background:'+c+'"><span>'+taxa+'% ('+v.t+')</span></div></div>'
      + '</div>';
  }).join('');

  // Table Assuntos
  const assuntosArr = Object.entries(porAssunto).filter(a => a[1].t >= 5).sort((a,b) => b[1].t - a[1].t).slice(0,15);
  let html = '<table class="data-table"><thead><tr><th>ASSUNTO</th><th>DECIS\u00d5ES</th><th>PROVIDOS</th><th>TAXA</th></tr></thead><tbody>';
  assuntosArr.forEach(([assunto, v]) => {
    const taxa = v.t > 0 ? ((v.p / v.t) * 100).toFixed(1) : '0';
    const c = parseFloat(taxa) >= parseFloat(mediaSTF) ? 'color:var(--gold)' : 'color:#e05252';
    html += '<tr><td>'+assunto.replace(/_/g,' ')+'</td><td>'+v.t+'</td><td>'+v.p+'</td><td style="'+c+';font-family:DM Mono,monospace">'+taxa+'%</td></tr>';
  });
  html += '</tbody></table>';
  document.getElementById('table-assuntos').innerHTML = html;
}

main().catch(e => {
  document.querySelectorAll('.loading').forEach(el => el.textContent = 'Erro ao carregar: ' + e.message);
});
</script>
</body>
</html>`;
}

// Generate all minister pages
for (const m of ministros) {
  const html = gerarPagina(m);
  const filePath = path.join(dir, m.slug + '.html');
  fs.writeFileSync(filePath, html, 'utf8');
  console.log('Created:', m.slug + '.html');
}

console.log('\nAll minister pages generated!');
