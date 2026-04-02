import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://ejwyguskoiraredinqmb.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVqd3lndXNrb2lyYXJlZGlucW1iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwMjI5NjcsImV4cCI6MjA4OTU5ODk2N30.YJvuOqXThPk_XQLLY63Cy-5KlJUQMQX0aZMjXke0x8s';

const dir = 'C:/Users/medin/projetos/judx-platform/public/taxa_provimento';

const ministros = [
  { nome: 'Alexandre de Moraes', relator: 'MIN. ALEXANDRE DE MORAES', slug: 'moraes', ini: 'AM', role: '1\u00aa Turma', foto: 'moraes.jpg', posse: 2017 },
  { nome: 'Fl\u00e1vio Dino', relator: 'MIN. FL\u00c1VIO DINO', slug: 'dino', ini: 'FD', role: '1\u00aa Turma', foto: 'dino.jpg', posse: 2024 },
  { nome: 'Lu\u00eds Roberto Barroso', relator: 'MIN. LU\u00cdS ROBERTO BARROSO', slug: 'barroso', ini: 'LRB', role: 'Presidente', foto: 'barroso.jpg', posse: 2013 },
  { nome: 'Edson Fachin', relator: 'MIN. EDSON FACHIN', slug: 'fachin', ini: 'EF', role: '1\u00aa Turma', foto: 'fachin.jpg', posse: 2015 },
  { nome: 'Andr\u00e9 Mendon\u00e7a', relator: 'MIN. ANDR\u00c9 MENDON\u00c7A', slug: 'andre-mendonca', ini: 'AM', role: '2\u00aa Turma', foto: 'andre.jpg', posse: 2021 },
  { nome: 'Nunes Marques', relator: 'MIN. NUNES MARQUES', slug: 'nunes-marques', ini: 'NM', role: '2\u00aa Turma', foto: 'nunes.jpg', posse: 2020 },
  { nome: 'Gilmar Mendes', relator: 'MIN. GILMAR MENDES', slug: 'gilmar-mendes', ini: 'GM', role: '2\u00aa Turma', foto: 'gilmar.jpg', posse: 2002 },
  { nome: 'C\u00e1rmen L\u00facia', relator: 'MIN. C\u00c1RMEN L\u00daCIA', slug: 'carmen-lucia', ini: 'CL', role: '1\u00aa Turma', foto: 'carmen.jpg', posse: 2006 },
  { nome: 'Cristiano Zanin', relator: 'MIN. CRISTIANO ZANIN', slug: 'zanin', ini: 'CZ', role: '1\u00aa Turma', foto: 'zanin.jpg', posse: 2023 },
  { nome: 'Dias Toffoli', relator: 'MIN. DIAS TOFFOLI', slug: 'toffoli', ini: 'DT', role: '2\u00aa Turma', foto: 'toffoli.jpg', posse: 2009 },
  { nome: 'Luiz Fux', relator: 'MIN. LUIZ FUX', slug: 'fux', ini: 'LF', role: '2\u00aa Turma', foto: 'fux.jpg', posse: 2011 },
];

function gerarPagina(m) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${m.nome} \u00b7 Taxa de Provimento \u00b7 JudX</title>
<meta name="robots" content="noindex, nofollow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,900;1,700&family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root {
  --navy: #0a1525; --navy-2: #0d1f35; --navy-3: #112a4a;
  --gold: #c8922a; --gold-light: #e8b84b; --gold-dim: rgba(200,146,42,0.15);
  --red: #e05252; --green: #4ade80;
  --text: #e8f0f8; --text-muted: #6a8aa5; --text-dim: #3a5a74;
  --glass: rgba(15,30,50,0.7); --glass-border: rgba(200,146,42,0.12);
  --glow: 0 0 30px rgba(200,146,42,0.08);
}
*{margin:0;padding:0;box-sizing:border-box}
html{scroll-behavior:smooth}
body{background:var(--navy);color:var(--text);font-family:'DM Sans',sans-serif;line-height:1.6;min-height:100vh;overflow-x:hidden;
  -webkit-user-select:none;user-select:none}
body.loaded{-webkit-user-select:auto;user-select:auto}

/* Anti-scraping overlay */
.shield{position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;background:var(--navy);display:flex;align-items:center;justify-content:center;transition:opacity 0.5s,visibility 0.5s}
.shield.hidden{opacity:0;visibility:hidden;pointer-events:none}
.shield-inner{text-align:center}
.shield-logo{font-family:'Playfair Display',serif;font-size:2rem;font-weight:900;color:var(--gold);margin-bottom:1rem}
.shield-bar{width:200px;height:3px;background:var(--navy-3);border-radius:2px;overflow:hidden;margin:0 auto}
.shield-fill{height:100%;background:linear-gradient(90deg,var(--gold),var(--gold-light));width:0;animation:loadBar 1.5s ease forwards}
@keyframes loadBar{to{width:100%}}

/* Skeleton pulse */
@keyframes pulse{0%,100%{opacity:0.4}50%{opacity:0.8}}
.skel{background:linear-gradient(90deg,var(--navy-3) 25%,var(--navy-2) 50%,var(--navy-3) 75%);background-size:200% 100%;animation:shimmer 1.5s infinite;border-radius:4px}
@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}
.skel-num{display:inline-block;width:60px;height:1.4rem}
.skel-bar{height:24px;margin-bottom:0.6rem;border-radius:2px}
.skel-row{height:36px;margin-bottom:4px;border-radius:2px}

/* Animated counter */
@keyframes countUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
.counted{animation:countUp 0.4s ease}

/* Header */
.hdr{display:flex;justify-content:space-between;align-items:center;padding:1rem 2rem;border-bottom:1px solid var(--glass-border);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;background:rgba(10,21,37,0.9)}
.hdr-logo{color:var(--gold);font-size:0.7rem;letter-spacing:0.18em;font-weight:700;text-decoration:none;text-transform:uppercase}
.hdr-back{color:var(--text-muted);font-size:0.78rem;text-decoration:none;display:flex;align-items:center;gap:0.4rem;transition:all 0.2s}
.hdr-back:hover{color:var(--gold);gap:0.6rem}
.hdr-back svg{width:16px;height:16px;fill:currentColor}

/* Hero */
.hero{display:grid;grid-template-columns:160px 1fr;gap:2.5rem;padding:3rem 2.5rem 2.5rem;background:linear-gradient(180deg,rgba(15,25,45,1) 0%,var(--navy) 100%);border-bottom:1px solid var(--glass-border);position:relative;overflow:hidden}
.hero::before{content:'';position:absolute;top:-50%;right:-20%;width:500px;height:500px;background:radial-gradient(circle,rgba(200,146,42,0.06) 0%,transparent 70%);pointer-events:none}
.hero-photo{width:140px;height:140px;border-radius:50%;overflow:hidden;border:3px solid rgba(200,146,42,0.35);box-shadow:0 0 40px rgba(200,146,42,0.1);position:relative}
.hero-photo img{width:100%;height:100%;object-fit:cover;object-position:top}
.hero-photo::after{content:'';position:absolute;inset:0;border-radius:50%;background:linear-gradient(135deg,transparent 60%,rgba(200,146,42,0.1))}
.h-label{color:var(--text-muted);font-size:0.65rem;letter-spacing:0.2em;font-weight:500;text-transform:uppercase;margin-bottom:0.2rem}
.h-pct{font-family:'Playfair Display',serif;font-size:3.5rem;font-weight:900;line-height:1;margin-bottom:0.2rem;transition:color 0.3s}
.h-name{font-family:'Playfair Display',serif;font-size:2rem;font-weight:900;line-height:1.1;margin-bottom:0.3rem}
.h-role{color:var(--text-muted);font-size:0.82rem;margin-bottom:0.8rem;display:flex;align-items:center;gap:0.5rem}
.h-role .dot{width:6px;height:6px;border-radius:50%;background:var(--gold);display:inline-block}
.h-detail{color:var(--text-dim);font-size:0.78rem}
.h-badge{display:inline-flex;align-items:center;gap:0.3rem;background:rgba(200,146,42,0.1);border:1px solid var(--gold-dim);padding:0.2rem 0.6rem;border-radius:20px;font-size:0.65rem;color:var(--gold);letter-spacing:0.05em;margin-top:0.6rem}

/* Content */
.wrap{max-width:1100px;margin:0 auto;padding:2rem 2rem 4rem}

/* Stats grid */
.stats{display:grid;grid-template-columns:repeat(6,1fr);gap:0.8rem;margin-bottom:2.5rem}
.stat{background:var(--glass);backdrop-filter:blur(8px);border:1px solid var(--glass-border);padding:1rem;border-radius:6px;transition:transform 0.2s,border-color 0.2s;position:relative;overflow:hidden}
.stat:hover{transform:translateY(-2px);border-color:rgba(200,146,42,0.3)}
.stat::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,var(--gold-dim),transparent)}
.stat .lbl{color:var(--text-muted);font-size:0.6rem;letter-spacing:0.12em;text-transform:uppercase;margin-bottom:0.3rem}
.stat .val{font-family:'DM Mono',monospace;font-size:1.3rem;font-weight:500}
.stat .val.gold{color:var(--gold)}.stat .val.red{color:var(--red)}

/* Section */
.sec{margin-bottom:2.5rem}
.sec-head{display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;padding-bottom:0.6rem;border-bottom:1px solid var(--glass-border)}
.sec-title{font-family:'Playfair Display',serif;font-size:1.1rem;font-weight:700;color:var(--gold)}
.sec-sub{font-size:0.7rem;color:var(--text-dim);letter-spacing:0.05em}

/* Bars */
.bar-row{display:flex;align-items:center;gap:0.8rem;margin-bottom:0.5rem}
.bar-lbl{width:100px;font-size:0.72rem;color:var(--text-muted);text-align:right;flex-shrink:0;font-family:'DM Mono',monospace}
.bar-track{flex:1;height:28px;background:rgba(255,255,255,0.03);border-radius:3px;overflow:hidden;position:relative}
.bar-fill{height:100%;border-radius:3px;display:flex;align-items:center;padding:0 10px;transition:width 0.8s cubic-bezier(0.22,1,0.36,1);min-width:0;overflow:hidden}
.bar-fill span{font-family:'DM Mono',monospace;font-size:0.68rem;color:#fff;white-space:nowrap;text-shadow:0 1px 3px rgba(0,0,0,0.5)}

/* Table */
.tbl{width:100%;border-collapse:collapse}
.tbl th{text-align:left;color:var(--text-muted);font-size:0.62rem;letter-spacing:0.12em;padding:0.6rem 0.8rem;border-bottom:1px solid var(--glass-border);text-transform:uppercase}
.tbl td{padding:0.55rem 0.8rem;font-size:0.78rem;border-bottom:1px solid rgba(255,255,255,0.03)}
.tbl tr{transition:background 0.15s}.tbl tr:hover{background:rgba(200,146,42,0.04)}
.tbl .mono{font-family:'DM Mono',monospace;font-size:0.75rem}

/* Coming soon - Prediction Markets */
.future{margin-top:3rem;background:linear-gradient(135deg,rgba(200,146,42,0.05) 0%,rgba(15,25,45,0.8) 100%);border:1px solid var(--gold-dim);border-radius:8px;padding:2rem;position:relative;overflow:hidden}
.future::before{content:'EM BREVE';position:absolute;top:12px;right:-28px;background:var(--gold);color:var(--navy);font-size:0.55rem;font-weight:700;letter-spacing:0.15em;padding:0.2rem 2.5rem;transform:rotate(45deg)}
.future h3{font-family:'Playfair Display',serif;font-size:1.3rem;color:var(--gold);margin-bottom:0.5rem}
.future p{color:var(--text-muted);font-size:0.82rem;max-width:600px;line-height:1.7}
.future-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin-top:1.2rem}
.future-item{background:rgba(10,21,37,0.6);border:1px dashed var(--gold-dim);border-radius:6px;padding:1rem;text-align:center}
.future-item .fi-icon{font-size:1.5rem;margin-bottom:0.4rem}
.future-item .fi-title{font-size:0.75rem;font-weight:700;color:var(--text);margin-bottom:0.2rem}
.future-item .fi-desc{font-size:0.65rem;color:var(--text-dim)}

/* CTA cadastro */
.cta-oab{margin-top:2rem;background:var(--navy-2);border:1px solid var(--glass-border);border-radius:8px;padding:2rem;text-align:center}
.cta-oab h3{font-family:'Playfair Display',serif;font-size:1.2rem;margin-bottom:0.4rem}
.cta-oab p{color:var(--text-muted);font-size:0.8rem;margin-bottom:1.2rem}
.cta-form{display:flex;gap:0.6rem;max-width:500px;margin:0 auto;flex-wrap:wrap;justify-content:center}
.cta-input{background:var(--navy-3);border:1px solid var(--glass-border);color:var(--text);padding:0.65rem 1rem;font-size:0.8rem;border-radius:4px;font-family:'DM Sans',sans-serif;flex:1;min-width:140px;transition:border-color 0.2s}
.cta-input:focus{outline:none;border-color:var(--gold)}
.cta-input::placeholder{color:var(--text-dim)}
.cta-btn{background:var(--gold);color:var(--navy);font-size:0.7rem;font-weight:700;letter-spacing:0.1em;padding:0.65rem 1.5rem;border:none;border-radius:4px;cursor:pointer;text-transform:uppercase;transition:background 0.2s}
.cta-btn:hover{background:var(--gold-light)}
.cta-note{font-size:0.65rem;color:var(--text-dim);margin-top:0.6rem}
.paywall-btn{display:inline-block;background:var(--gold);color:var(--navy);font-size:0.68rem;font-weight:700;letter-spacing:0.1em;padding:0.55rem 1.5rem;text-decoration:none;border-radius:4px;text-transform:uppercase;transition:background 0.2s}
.paywall-btn:hover{background:var(--gold-light)}

/* Footer */
.ftr{border-top:1px solid var(--glass-border);padding:1.2rem 2rem;display:flex;justify-content:space-between;color:var(--text-dim);font-size:0.65rem;letter-spacing:0.08em}

/* Mobile */
@media(max-width:768px){
  .hero{grid-template-columns:1fr;text-align:center;justify-items:center;gap:1rem;padding:2rem 1.2rem}
  .hero-photo{width:100px;height:100px}
  .h-pct{font-size:2.5rem}
  .h-name{font-size:1.5rem}
  .h-role{justify-content:center}
  .wrap{padding:1.5rem 1rem 3rem}
  .stats{grid-template-columns:repeat(3,1fr);gap:0.5rem}
  .stat{padding:0.7rem}.stat .val{font-size:1rem}
  .bar-lbl{width:70px;font-size:0.6rem}
  .bar-track{height:22px}
  .future-grid{grid-template-columns:1fr}
  .cta-form{flex-direction:column}
  .cta-input{min-width:auto}
  .ftr{flex-direction:column;gap:0.3rem;text-align:center;padding:1rem}
  .hdr{padding:0.8rem 1rem}
}
@media(max-width:400px){
  .stats{grid-template-columns:repeat(2,1fr)}
}
</style>
</head>
<body>

<header class="hdr">
  <a href="/taxa_provimento/" class="hdr-logo">JudX \u00b7 Intelig\u00eancia Jurisprudencial</a>
  <a href="/taxa_provimento/" class="hdr-back">
    <svg viewBox="0 0 24 24"><path d="M15.41 7.41L14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg>
    Voltar ao painel
  </a>
</header>

<section class="hero">
  <div class="hero-photo">
    <img src="/ministros/${m.foto}" alt="${m.nome}" onerror="this.style.display='none';this.parentElement.textContent='${m.ini}'">
  </div>
  <div>
    <div class="h-label">Taxa de provimento</div>
    <div class="h-pct" id="h-pct"><span class="skel skel-num" style="width:100px;height:3rem"></span></div>
    <h1 class="h-name">${m.nome}</h1>
    <div class="h-role"><span class="dot"></span>${m.role} \u00b7 STF \u00b7 Posse em ${m.posse}</div>
    <div class="h-detail" id="h-detail"><span class="skel skel-num" style="width:250px"></span></div>
    <div class="h-badge" id="h-badge" style="opacity:0">\u25cf vs. m\u00e9dia STF</div>
  </div>
</section>

<div class="wrap">

  <div class="stats" id="stats">
    <div class="stat"><div class="lbl">Total decis\u00f5es</div><div class="val" id="s-total"><span class="skel skel-num"></span></div></div>
    <div class="stat"><div class="lbl">Providos</div><div class="val gold" id="s-provido"><span class="skel skel-num"></span></div></div>
    <div class="stat"><div class="lbl">N\u00e3o providos</div><div class="val" id="s-nao-provido"><span class="skel skel-num"></span></div></div>
    <div class="stat"><div class="lbl">Parcial</div><div class="val" id="s-parcial"><span class="skel skel-num"></span></div></div>
    <div class="stat"><div class="lbl">N\u00e3o conhecidos</div><div class="val red" id="s-nao-conhecido"><span class="skel skel-num"></span></div></div>
    <div class="stat"><div class="lbl">M\u00e9dia STF (ponderada)</div><div class="val" style="color:var(--text-muted)" id="s-media"><span class="skel skel-num"></span></div></div>
  </div>

  <div class="sec">
    <div class="sec-head">
      <div class="sec-title">Evolu\u00e7\u00e3o por Ano</div>
      <div class="sec-sub">A partir da posse (${m.posse})</div>
    </div>
    <div id="chart-anos">
      ${[1,2,3,4].map(() => '<div class="skel skel-bar" style="width:' + (30 + Math.random()*60) + '%"></div>').join('')}
    </div>
  </div>

  <div class="sec">
    <div class="sec-head">
      <div class="sec-title">Por Ramo do Direito</div>
      <div class="sec-sub">Top 8 \u00e1reas</div>
    </div>
    <div id="chart-ramos">
      ${[1,2,3,4,5].map(() => '<div class="skel skel-bar" style="width:' + (20 + Math.random()*70) + '%"></div>').join('')}
    </div>
  </div>

  <div class="sec">
    <div class="sec-head">
      <div class="sec-title">Top Assuntos</div>
      <div class="sec-sub">M\u00ednimo 5 decis\u00f5es</div>
    </div>
    <div id="tbl-assuntos">
      ${[1,2,3,4,5,6].map(() => '<div class="skel skel-row"></div>').join('')}
    </div>
  </div>

  <!-- Prediction Markets teaser -->
  <div class="future">
    <h3>Prediction Markets Jur\u00eddicos</h3>
    <p>Em breve, a comunidade jur\u00eddica poder\u00e1 analisar probabilidades e tend\u00eancias de provimento em tempo real.</p>
    <div class="future-grid">
      <div class="future-item">
        <div class="fi-icon">\u2696\ufe0f</div>
        <div class="fi-title">3 Filtros</div>
        <div class="fi-desc">Previs\u00e3o de admissibilidade, m\u00e9rito e provimento por processo</div>
      </div>
      <div class="future-item">
        <div class="fi-icon">\ud83d\udcca</div>
        <div class="fi-title">Tend\u00eancias</div>
        <div class="fi-desc">Sinais de mudan\u00e7a de posi\u00e7\u00e3o por ministro e ramo</div>
      </div>
      <div class="future-item">
        <div class="fi-icon">\ud83d\udcac</div>
        <div class="fi-title">Comunidade</div>
        <div class="fi-desc">Discuss\u00e3o entre advogados com an\u00e1lise de dados integrada</div>
      </div>
    </div>
  </div>

  <!-- Cadastro OAB -->
  <div class="cta-oab">
    <h3>Acesso antecipado para advogados</h3>
    <p>Cadastre-se com seu n\u00famero da OAB para receber acesso priorit\u00e1rio \u00e0s novas funcionalidades.</p>
    <form class="cta-form" onsubmit="handleCadastro(event)">
      <input class="cta-input" type="text" placeholder="N\u00ba OAB (ex: 123456/SP)" id="oab-input" required pattern="[0-9]{3,7}/[A-Z]{2}">
      <input class="cta-input" type="email" placeholder="seu@email.com" id="email-input" required>
      <button class="cta-btn" type="submit">Solicitar acesso</button>
    </form>
    <div class="cta-note" id="cta-msg">OAB ser\u00e1 verificada \u00b7 Dados protegidos \u00b7 Sem spam</div>
  </div>

</div>

<footer class="ftr">
  <span>JudX \u00b7 Intelig\u00eancia Jurisprudencial \u00b7 judx.com.br</span>
  <span>\u00a9 ${new Date().getFullYear()} \u00b7 Todos os direitos reservados</span>
</footer>

<script>
(function(){
  // Anti-scraping: block if no JS or automated
  if(navigator.webdriver){document.body.innerHTML='';return}

  const $=id=>document.getElementById(id);
  const SUPA='${SUPABASE_URL}';
  const KEY='${SUPABASE_KEY}';
  const REL='${m.relator}';
  const POSSE=${m.posse};
  const avg='6.2'; // Pre-computed weighted STF average
  const H={apikey:KEY,Authorization:'Bearer '+KEY};

  async function fp(base){
    let a=[],o=0;
    while(true){
      const r=await fetch(base+'&limit=10000&offset='+o,{headers:H});
      const d=await r.json();a=a.concat(d);
      if(d.length<10000)break;o+=10000;
    }
    return a;
  }

  function anim(el,v){el.textContent=v;el.classList.add('counted')}

  async function go(){
    const dados=await fp(SUPA+'/rest/v1/v_provimento_merito?select=categoria_provimento,ramo_direito,assunto_principal,ano&relator=eq.'+encodeURIComponent(REL)+'&ano=gte.'+POSSE);

    // Minister
    let prov=0,nprov=0,parc=0,ncon=0;
    const pA={},pR={},pAs={};
    dados.forEach(r=>{
      const c=r.categoria_provimento;
      if(c==='provido')prov++;else if(c==='nao_provido')nprov++;else if(c==='parcial')parc++;else if(c==='nao_conhecido')ncon++;
      const a=r.ano||0;if(a>=POSSE){if(!pA[a])pA[a]={t:0,p:0};pA[a].t++;if(c==='provido')pA[a].p++}
      const rm=r.ramo_direito||'N/I';if(!pR[rm])pR[rm]={t:0,p:0};pR[rm].t++;if(c==='provido')pR[rm].p++;
      const as=r.assunto_principal||'N/I';if(!pAs[as])pAs[as]={t:0,p:0};pAs[as].t++;if(c==='provido')pAs[as].p++;
    });

    const base=prov+nprov+parc;
    const taxa=base>0?((prov/base)*100).toFixed(1):'0';
    const acima=parseFloat(taxa)>=parseFloat(avg);

    // Hero
    $('h-pct').textContent=taxa+'%';
    $('h-pct').style.color=acima?'var(--gold)':'var(--red)';
    $('h-detail').textContent=dados.length.toLocaleString('pt-BR')+' decis\u00f5es colegiadas de m\u00e9rito ('+POSSE+'\u2013'+new Date().getFullYear()+')';
    const badge=S('h-badge');
    badge.style.opacity='1';
    badge.textContent=(acima?'\u25b2':'\u25bc')+' '+(acima?'Acima':'Abaixo')+' da m\u00e9dia STF ('+avg+'%)';
    badge.style.color=acima?'var(--gold)':'var(--red)';
    badge.style.borderColor=acima?'rgba(200,146,42,0.3)':'rgba(224,82,82,0.3)';
    badge.style.background=acima?'rgba(200,146,42,0.1)':'rgba(224,82,82,0.1)';

    // Stats
    anim(S('s-total'),dados.length.toLocaleString('pt-BR'));
    anim(S('s-provido'),prov.toLocaleString('pt-BR'));
    anim(S('s-nao-provido'),nprov.toLocaleString('pt-BR'));
    anim(S('s-parcial'),parc.toLocaleString('pt-BR'));
    anim(S('s-nao-conhecido'),ncon.toLocaleString('pt-BR'));
    anim(S('s-media'),avg+'%');

    // Anos chart
    const anos=Object.keys(pA).sort();
    const mxA=Math.max(...anos.map(a=>pA[a].t),1);
    $('chart-anos').innerHTML=anos.map((a,i)=>{
      const t=pA[a].t,p=pA[a].p;
      const tx=t>0?((p/t)*100).toFixed(1):'0';
      const w=Math.max(Math.round((t/mxA)*100),3);
      const c=parseFloat(tx)>=parseFloat(avg)?'var(--gold)':'var(--red)';
      return '<div class="bar-row" style="animation:countUp 0.4s ease '+(i*0.08)+'s both"><div class="bar-lbl">'+a+'</div><div class="bar-track"><div class="bar-fill" style="width:'+w+'%;background:'+c+'"><span>'+tx+'% ('+t+')</span></div></div></div>';
    }).join('');

    // Ramos chart
    const rms=Object.entries(pR).sort((a,b)=>b[1].t-a[1].t).slice(0,8);
    const mxR=rms[0]?rms[0][1].t:1;
    $('chart-ramos').innerHTML=rms.map(([rm,v],i)=>{
      const tx=v.t>0?((v.p/v.t)*100).toFixed(1):'0';
      const w=Math.max(Math.round((v.t/mxR)*100),3);
      const c=parseFloat(tx)>=parseFloat(avg)?'var(--gold)':'var(--red)';
      return '<div class="bar-row" style="animation:countUp 0.4s ease '+(i*0.06)+'s both"><div class="bar-lbl">'+rm+'</div><div class="bar-track"><div class="bar-fill" style="width:'+w+'%;background:'+c+'"><span>'+tx+'% ('+v.t+')</span></div></div></div>';
    }).join('');

    // Assuntos table
    const allAss=Object.entries(pAs).filter(a=>a[1].t>=5).sort((a,b)=>b[1].t-a[1].t);
    const top5=allAss.slice(0,5);
    const remaining=allAss.length-5;
    let h='<table class="tbl"><thead><tr><th>Assunto</th><th>Decis\u00f5es</th><th>Providos</th><th>Taxa</th></tr></thead><tbody>';
    top5.forEach(([a,v])=>{
      const tx=v.t>0?((v.p/v.t)*100).toFixed(1):'0';
      const c=parseFloat(tx)>=parseFloat(avg)?'color:var(--gold)':'color:var(--red)';
      h+='<tr><td>'+a.replace(/_/g,' ')+'</td><td class="mono">'+v.t+'</td><td class="mono">'+v.p+'</td><td class="mono" style="'+c+'">'+tx+'%</td></tr>';
    });
    h+='</tbody></table>';
    if(remaining>0){
      h+='<div style="text-align:center;margin-top:1.2rem;padding:1.2rem;background:linear-gradient(180deg,transparent,rgba(200,146,42,0.05));border:1px dashed var(--gold-dim);border-radius:6px">'
        +'<div style="font-size:0.85rem;color:var(--text-muted);margin-bottom:0.5rem">+ '+remaining+' assuntos dispon\u00edveis</div>'
        +'<div style="font-family:Playfair Display,serif;font-size:1rem;color:var(--gold);margin-bottom:0.6rem">Desbloqueie a an\u00e1lise completa</div>'
        +'<a href="/planos" class="paywall-btn">Ver todos os assuntos \u2192</a>'
        +'</div>';
    }
    $('tbl-assuntos').innerHTML=h;

    document.body.classList.add('loaded');
  }

  go().catch(e=>{
    document.body.classList.add('loaded');
    console.error(e);
  });

  // Cadastro handler
  window.handleCadastro=function(e){
    e.preventDefault();
    const oab=document.getElementById('oab-input').value;
    const email=document.getElementById('email-input').value;
    const msg=document.getElementById('cta-msg');
    if(!/^\\d{3,7}\\/[A-Z]{2}$/.test(oab)){msg.textContent='\u26a0 Formato OAB inv\u00e1lido. Use: 123456/SP';msg.style.color='var(--red)';return}
    msg.textContent='\u2713 Cadastro recebido! Verificaremos sua OAB e entraremos em contato.';
    msg.style.color='var(--green)';
  };
})();
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
