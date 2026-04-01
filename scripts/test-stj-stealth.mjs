import { chromium } from 'playwright';

const browser = await chromium.launch({ 
  headless: false,  // Headed mode bypasses some Cloudflare checks
  args: [
    '--disable-blink-features=AutomationControlled',
    '--no-sandbox',
  ]
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 1920, height: 1080 },
  locale: 'pt-BR',
});

// Remove webdriver flag
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
});

const page = await context.newPage();

console.log('Navigating...');
await page.goto('https://processo.stj.jus.br/processo/pesquisa/?tipoPesquisa=tipoPesquisaNumeroRegistro&termo=200901012345&aplicacao=processos.ea', {
  waitUntil: 'networkidle',
  timeout: 45000
});

console.log('Title:', await page.title());
console.log('URL:', page.url());

// Wait for possible Cloudflare to resolve
if ((await page.title()).includes('moment')) {
  console.log('Cloudflare challenge, waiting up to 15s...');
  try {
    await page.waitForFunction(() => !document.title.includes('moment'), { timeout: 15000 });
    console.log('Challenge passed! Title:', await page.title());
  } catch(e) {
    console.log('Challenge NOT passed after 15s');
  }
}

const html = await page.content();
console.log('HTML length:', html.length);

// Look for parties info
const partesMatch = html.match(/RECORRENTE[^<]{0,100}|RECORRIDO[^<]{0,100}|PARTE[^<]{0,100}|parte[^<]{0,100}/gi);
console.log('Partes matches:', partesMatch?.slice(0, 10));

// Screenshot for debug
await page.screenshot({ path: '/c/Users/medin/Desktop/stj-test.png' });
console.log('Screenshot saved to Desktop/stj-test.png');

await browser.close();
