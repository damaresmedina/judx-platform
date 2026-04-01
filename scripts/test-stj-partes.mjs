import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

// Acessar página de detalhe do processo REsp 1101723
console.log('Navigating to STJ process page...');
try {
  await page.goto('https://processo.stj.jus.br/processo/pesquisa/?tipoPesquisa=tipoPesquisaNumeroRegistro&termo=200901012345&aplicacao=processos.ea', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });
  console.log('Page title:', await page.title());
  console.log('URL:', page.url());
  
  // Verificar se tem Cloudflare challenge
  const content = await page.content();
  if (content.includes('challenge-platform') || content.includes('cf-browser-verification')) {
    console.log('Cloudflare challenge detected, waiting...');
    await page.waitForTimeout(5000);
    console.log('After wait - URL:', page.url());
    console.log('After wait - Title:', await page.title());
  }
  
  // Procurar por partes/parties na página
  const html = await page.content();
  
  // Procurar links para aba de partes
  const partesLinks = await page.$$eval('a', links => 
    links.filter(a => a.textContent.toLowerCase().includes('parte') || a.href?.includes('parte'))
      .map(a => ({ text: a.textContent.trim(), href: a.href }))
  ).catch(() => []);
  console.log('Links com "parte":', JSON.stringify(partesLinks));
  
  // Procurar toda informação de partes na página
  const partesText = html.match(/RECORRENTE[^<]*|RECORRIDO[^<]*|IMPETRANTE[^<]*|IMPETRADO[^<]*|PARTE[^<]*/gi);
  console.log('Matches de partes no HTML:', partesText?.slice(0, 10));
  
  // Tamanho do HTML
  console.log('HTML size:', html.length, 'chars');
  
} catch(e) {
  console.error('Error:', e.message);
}

await browser.close();
