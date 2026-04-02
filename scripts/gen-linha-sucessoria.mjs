import fs from 'fs';

const dataJS = fs.readFileSync('data_ministros.js', 'utf8');

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Linha Sucessória do STF · JudX</title>
<meta name="robots" content="noindex, nofollow">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;900&family=DM+Sans:wght@300;400;500;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
:root{--navy:#0a1525;--navy2:#0d1f35;--navy3:#112a4a;--gold:#c8922a;--goldL:#e8b84b;--goldD:rgba(200,146,42,0.15);--red:#e05252;--txt:#e8f0f8;--mut:#6a8aa5;--dim:#3a5a74;--gbrd:rgba(200,146,42,0.12)}
*{margin:0;padding:0;box-sizing:border-box}
body{background:var(--navy);color:var(--txt);font-family:'DM Sans',sans-serif;line-height:1.6}
@keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}

.hdr{display:flex;justify-content:space-between;align-items:center;padding:1rem 2rem;border-bottom:1px solid var(--gbrd);backdrop-filter:blur(12px);position:sticky;top:0;z-index:100;background:rgba(10,21,37,0.95)}
.hdr a{color:var(--gold);font-size:.7rem;letter-spacing:.18em;font-weight:700;text-decoration:none;text-transform:uppercase}
.hdr .back{color:var(--mut);font-size:.78rem;letter-spacing:0;text-transform:none}
.hdr .back:hover{color:var(--gold)}

.hero{padding:2.5rem 2rem 1.5rem;border-bottom:1px solid var(--gbrd);background:linear-gradient(180deg,rgba(15,25,45,1),var(--navy))}
.hero h1{font-family:'Playfair Display',serif;font-size:2.2rem;font-weight:900;margin-bottom:.3rem}
.hero h1 span{color:var(--gold);font-style:italic}
.hero p{color:var(--mut);font-size:.85rem;max-width:600px}
.hero-stats{display:flex;gap:2rem;margin-top:1rem}
.hs{text-align:center}
.hs-n{font-family:'Playfair Display',serif;font-size:1.8rem;font-weight:900;color:var(--gold)}
.hs-l{font-size:.6rem;color:var(--mut);letter-spacing:.1em;text-transform:uppercase}

.ctrls{padding:1rem 2rem;display:flex;gap:1rem;flex-wrap:wrap;align-items:center;border-bottom:1px solid var(--gbrd)}
.ctrls label{font-size:.7rem;color:var(--mut);letter-spacing:.08em}
.ctrls select,.ctrls input{background:var(--navy3);border:1px solid var(--gbrd);color:var(--txt);padding:.4rem .8rem;font-size:.75rem;border-radius:4px;font-family:'DM Sans',sans-serif}
.ctrls input{width:180px}

.leg{display:flex;gap:1rem;flex-wrap:wrap;padding:.6rem 2rem;font-size:.6rem;border-bottom:1px solid var(--gbrd)}
.leg span{display:flex;align-items:center;gap:.3rem}
.leg .ld{width:8px;height:8px;border-radius:2px;flex-shrink:0}

.wrap{max-width:1200px;margin:0 auto;padding:1.5rem 2rem 4rem}

.timeline{position:relative;padding-left:40px}
.timeline::before{content:'';position:absolute;left:18px;top:0;bottom:0;width:2px;background:var(--gbrd)}

.decade{margin-bottom:1.5rem}
.dec-lbl{font-family:'Playfair Display',serif;font-size:1rem;color:var(--gold);margin-bottom:.6rem;position:relative}
.dec-lbl::before{content:'';position:absolute;left:-26px;top:6px;width:10px;height:10px;background:var(--gold);border-radius:50%}
.m-pres{font-size:.58rem;color:rgba(255,255,255,.45);background:rgba(255,255,255,.06);padding:.1rem .4rem;border-radius:3px;flex-shrink:0;max-width:120px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

.mr{display:flex;align-items:center;gap:.8rem;padding:.45rem .8rem;margin-bottom:2px;border-radius:4px;cursor:pointer;transition:background .15s;position:relative}
.mr:hover{background:rgba(200,146,42,.06)}
a.mr{text-decoration:none;color:inherit;cursor:pointer}
.mr.at{border-left:3px solid var(--gold)}
.md{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.my{font-family:'DM Mono',monospace;font-size:.68rem;color:var(--mut);width:75px;flex-shrink:0}
.mn{font-size:.8rem;font-weight:500;flex:1}
.mn.atn{color:var(--gold);font-weight:700}
.mb{height:4px;border-radius:2px;flex-shrink:0}
.mi{font-family:'DM Mono',monospace;font-size:.62rem;color:var(--dim);width:50px;text-align:right;flex-shrink:0}

.tip{position:fixed;z-index:200;background:var(--navy2);border:1px solid var(--gold);border-radius:6px;padding:1rem 1.2rem;max-width:320px;pointer-events:none;opacity:0;transition:opacity .15s;box-shadow:0 8px 30px rgba(0,0,0,.5)}
.tip.show{opacity:1;pointer-events:auto}
.tip h4{font-family:'Playfair Display',serif;font-size:.95rem;margin-bottom:.4rem}
.tr{display:flex;justify-content:space-between;gap:1rem;font-size:.7rem;padding:.12rem 0;border-bottom:1px solid rgba(255,255,255,.04)}
.tr .tl{color:var(--mut)}.tr .tv{color:var(--txt);text-align:right}
.tip-link{display:inline-block;margin-top:.6rem;background:var(--gold);color:var(--navy);font-size:.58rem;font-weight:700;letter-spacing:.1em;padding:.25rem .7rem;border-radius:3px;text-transform:uppercase;text-decoration:none;pointer-events:auto}
.tip-link:hover{background:var(--goldL)}

.ftr{border-top:1px solid var(--gbrd);padding:1.2rem 2rem;display:flex;justify-content:space-between;color:var(--dim);font-size:.65rem;letter-spacing:.08em}

@media(max-width:768px){
  .hero h1{font-size:1.5rem}.hero-stats{gap:1rem}.hero-stats .hs-n{font-size:1.3rem}
  .wrap{padding:1rem 1rem 3rem}.my{width:55px;font-size:.6rem}.mi{display:none}
  .ctrls{flex-direction:column;gap:.5rem}.ctrls input{width:100%}
  .ftr{flex-direction:column;gap:.3rem;text-align:center}
  .hdr{padding:.8rem 1rem}
}
</style>
</head>
<body>

<header class="hdr">
  <a href="/">JudX &middot; Intelig&ecirc;ncia Jurisprudencial</a>
  <a href="/taxa_provimento/" class="back">&larr; Taxa de Provimento</a>
</header>

<section class="hero">
  <h1>Linha Sucess&oacute;ria do <span>STF</span></h1>
  <p>174 nomeados desde 1890. Passe o cursor para detalhes. Clique nos ministros atuais para ver o perfil decis&oacute;rio.</p>
  <div class="hero-stats">
    <div class="hs"><div class="hs-n">171</div><div class="hs-l">Ministros</div></div>
    <div class="hs" style="position:relative"><div class="hs-n" style="color:var(--red)">3</div><div class="hs-l">Ministras</div><div style="font-size:.55rem;color:var(--red);margin-top:.15rem">1,7% em 135 anos</div></div>
    <div class="hs"><div class="hs-n">10</div><div class="hs-l">Atuais</div></div>
    <div class="hs"><div class="hs-n">27</div><div class="hs-l">Presidentes</div></div>
    <div class="hs"><div class="hs-n">135</div><div class="hs-l">Anos</div></div>
  </div>
</section>

<div class="leg" id="leg"></div>
<div class="ctrls">
  <label>Filtrar:</label>
  <select id="fP"><option value="">Todos os presidentes</option></select>
  <select id="fC"><option value="">Todas as carreiras</option></select>
  <input type="text" id="fB" placeholder="Buscar ministro...">
</div>

<div class="wrap">
  <div class="timeline" id="tl"></div>
</div>

<div class="tip" id="tip"></div>

<footer class="ftr">
  <span>JudX &middot; Intelig&ecirc;ncia Jurisprudencial &middot; judx.com.br</span>
  <span>&copy; 2026</span>
</footer>

<script>
${dataJS}

var pres={};DATA.forEach(function(m){if(m.ind&&!pres[m.ind])pres[m.ind]=m.cor});
document.getElementById('leg').innerHTML=Object.entries(pres).map(function(e){
  return '<span><div class="ld" style="background:'+e[1]+'"></div>'+e[0]+'</span>';
}).join('');

var fp=document.getElementById('fP'),fc=document.getElementById('fC'),fb=document.getElementById('fB');
[...new Set(DATA.map(function(m){return m.ind}).filter(Boolean))].forEach(function(p){
  var o=document.createElement('option');o.value=p;o.textContent=p;fp.appendChild(o);
});
[...new Set(DATA.map(function(m){return m.car}).filter(Boolean))].sort().forEach(function(c){
  var o=document.createElement('option');o.value=c;o.textContent=c;fc.appendChild(o);
});

var NOW=new Date().getFullYear();

function render(){
  var pf=fp.value,cf=fc.value,bf=fb.value.toLowerCase();
  var fl=DATA.filter(function(m){
    if(pf&&m.ind!==pf)return false;
    if(cf&&m.car!==cf)return false;
    if(bf&&m.n.toLowerCase().indexOf(bf)<0)return false;
    return true;
  });
  // Group by decade
  var decs={};
  fl.forEach(function(m){var d=m.pa?Math.floor(m.pa/10)*10:'s/d';if(!decs[d])decs[d]=[];decs[d].push(m)});
  var h='';
  Object.keys(decs).sort(function(a,b){return b-a}).forEach(function(dec){
    h+='<div class="decade"><div class="dec-lbl">'+dec+'s</div>';
    decs[dec].sort(function(a,b){return (b.pa||0)-(a.pa||0)}).forEach(function(m,i){
      var anos=m.sa?(m.sa-m.pa):(m.pa?(NOW-m.pa):0);
      var bw=Math.max(anos*4,8);
      var idx=DATA.indexOf(m);
      var shortPres=m.ind?(m.ind.split(' ').pop()):'';
      var isLink=!!m.slug;
      var openTag=isLink?'<a href="/taxa_provimento/'+m.slug+'.html"':'<div';
      var closeTag=isLink?'</a>':'</div>';
      h+=openTag+' class="mr'+(m.atual?' at':'')+'" data-i="'+idx+'" style="animation:fadeUp .3s ease '+(i*0.02)+'s both;border-left:3px solid '+(m.atual?'var(--gold)':m.cor)+'">'
        +'<div class="md" style="background:'+m.cor+'"></div>'
        +'<div class="my">'+(m.pa||'?')+(m.sa?'\\u2013'+m.sa:'\\u2013')+'</div>'
        +'<div class="mn'+(m.atual?' atn':'')+'">'+m.n+(m.g==='F'?' \\u2640':'')+(isLink?' \\u2192':'')+'</div>'
        +'<div class="mb" style="width:'+bw+'px;background:'+m.cor+'"></div>'
        +'<div class="m-pres" style="color:'+m.cor+'">'+shortPres+'</div>'
        +'<div class="mi">'+anos+'a</div>'
        +closeTag;
    });
    h+='</div>';
  });
  document.getElementById('tl').innerHTML=h;
  document.querySelectorAll('.mr').forEach(function(el){
    el.addEventListener('mouseenter',showT);
    el.addEventListener('mousemove',moveT);
    el.addEventListener('mouseleave',hideT);
  });
}

var tip=document.getElementById('tip');
function showT(e){
  var m=DATA[parseInt(this.dataset.i)];
  var anos=m.sa?(m.sa-m.pa):(NOW-m.pa);
  var h='<h4'+(m.atual?' style="color:var(--gold)"':'')+'>'+m.n+'</h4>';
  h+='<div class="tr"><span class="tl">Indica\\u00e7\\u00e3o</span><span class="tv">'+m.ind+'</span></div>';
  h+='<div class="tr"><span class="tl">Carreira</span><span class="tv">'+(m.car||'N/I')+'</span></div>';
  h+='<div class="tr"><span class="tl">Faculdade</span><span class="tv">'+(m.fac||'N/I')+'</span></div>';
  h+='<div class="tr"><span class="tl">Naturalidade</span><span class="tv">'+(m.loc||'N/I')+'</span></div>';
  h+='<div class="tr"><span class="tl">Per\\u00edodo</span><span class="tv">'+m.pa+(m.sa?' \\u2013 '+m.sa:' \\u2013 atual')+'</span></div>';
  h+='<div class="tr"><span class="tl">Tempo no STF</span><span class="tv">'+anos+' anos</span></div>';
  if(m.ip)h+='<div class="tr"><span class="tl">Idade na posse</span><span class="tv">'+m.ip+' anos</span></div>';
  if(m.ant)h+='<div class="tr"><span class="tl">Antecessor</span><span class="tv">'+m.ant+'</span></div>';
  if(m.slug)h+='<div style="margin-top:.4rem;font-size:.6rem;color:var(--gold)">Clique na linha para ver o perfil decis\\u00f3rio</div>';
  tip.innerHTML=h;tip.classList.add('show');
}
function moveT(e){
  var x=e.clientX+15,y=e.clientY+15;
  if(x+330>window.innerWidth)x=e.clientX-340;
  if(y+300>window.innerHeight)y=e.clientY-300;
  tip.style.left=x+'px';tip.style.top=y+'px';
}
function hideT(){tip.classList.remove('show')}

fp.addEventListener('change',render);
fc.addEventListener('change',render);
fb.addEventListener('input',render);
render();
</script>
</body>
</html>`;

fs.writeFileSync('public/linha-sucessoria.html', html, 'utf8');
console.log('Created: public/linha-sucessoria.html');
