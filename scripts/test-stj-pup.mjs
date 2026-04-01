import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080 });

console.log('Navigating to STJ...');
try {
  await page.goto('https://processo.stj.jus.br/processo/pesquisa/?termo=2971391&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO', {
    waitUntil: 'networkidle2',
    timeout: 45000
  });
  
  let title = await page.title();
  console.log('Title:', title);
  
  if (title.includes('moment') || title.includes('Cloudflare')) {
    console.log('Cloudflare detected, waiting 10s...');
    await new Promise(r => setTimeout(r, 10000));
    title = await page.title();
    console.log('After wait - Title:', title);
  }
  
  const html = await page.content();
  console.log('HTML length:', html.length);
  
  // Procurar partes
  const partesMatch = html.match(/RECORRENTE[^<]{0,200}|RECORRIDO[^<]{0,200}|RECTE[^<]{0,100}|RECDO[^<]{0,100}/gi);
  if (partesMatch) {
    console.log('\n=== PARTES ENCONTRADAS ===');
    partesMatch.forEach(m => console.log(' ', m.trim().substring(0, 120)));
  }
  
  // Procurar tabela de partes
  const tables = await page.$$eval('table', ts => ts.map(t => t.innerText.substring(0, 200)));
  console.log('\n=== TABLES ===');
  tables.forEach((t, i) => console.log(`Table ${i}:`, t.substring(0, 150)));
  
  await page.screenshot({ path: '/c/Users/medin/Desktop/stj-puppeteer.png', fullPage: true });
  console.log('\nScreenshot saved');
  
} catch(e) {
  console.error('Error:', e.message);
}

await browser.close();
