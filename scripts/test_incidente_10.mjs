import { chromium } from 'playwright';

async function run() {
  const browser = await chromium.launch({
    headless: false,
    args: ['--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo'
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false });
  });

  const page = await context.newPage();

  const testes = [
    { nome: 'portal raiz', url: 'https://portal.stf.jus.br/' },
    { nome: 'pesquisar.asp', url: 'https://portal.stf.jus.br/processos/pesquisar.asp' },
    { nome: 'detalhe incidente', url: 'https://portal.stf.jus.br/processos/detalhe.asp?incidente=6308034' },
    { nome: 'listarProcessos', url: 'https://portal.stf.jus.br/processos/listarProcessos.asp?tribunal=STF&classe=ARE&numero=1000000' },
    { nome: 'selecionar classe', url: 'https://portal.stf.jus.br/processos/selecionarClasse.asp' },
  ];

  for (const t of testes) {
    try {
      const resp = await page.goto(t.url, { waitUntil: 'domcontentloaded', timeout: 20000 });
      const html = await page.content();
      const is403 = html.includes('403 Forbidden');
      console.log(`${t.nome} -> HTTP ${resp?.status()} | ${is403 ? '403 REAL' : 'OK'} | ${html.length} bytes`);

      if (!is403 && t.nome === 'pesquisar.asp') {
        console.log('  HTML preview:', html.slice(0, 500).replace(/\n/g, ' ').slice(0, 200));
      }
      if (!is403 && t.nome === 'detalhe incidente') {
        const title = await page.title();
        console.log('  Title:', title);
        console.log('  URL:', page.url());
      }
    } catch (e) {
      console.log(`${t.nome} -> ERRO: ${e.message.slice(0, 80)}`);
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  await browser.close();
}

run();
