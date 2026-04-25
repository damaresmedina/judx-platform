/**
 * Teste: Playwright com Chromium headless consegue bypassar Cloudflare Turnstile do portal STJ?
 */
import { chromium } from 'playwright';
import fs from 'fs';

const URL = "https://processo.stj.jus.br/processo/pesquisa/?termo=2971391&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO";

console.log("[1] subindo Playwright chromium...");
const t0 = Date.now();
const browser = await chromium.launch({
    headless: true,
    args: ['--disable-blink-features=AutomationControlled']
});
const ctx = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36',
    viewport: { width: 1366, height: 768 },
    locale: 'pt-BR',
    timezoneId: 'America/Sao_Paulo',
});
// esconder webdriver
await ctx.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => undefined }); });
const page = await ctx.newPage();
console.log(`  UP em ${((Date.now()-t0)/1000).toFixed(1)}s`);

console.log("[2] navegando STJ portal...");
const t1 = Date.now();
try {
    await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(8000);
    const html = await page.content();
    console.log(`  HTML size: ${html.length.toLocaleString()} bytes em ${((Date.now()-t1)/1000).toFixed(1)}s`);

    fs.writeFileSync('C:\\Users\\medin\\projetos\\judx-platform\\scripts\\stj-portal-scraper\\_test_output_pw.html', html, 'utf-8');

    const passouCF = html.includes("idDetalhesPartesAdvogadosProcuradores") || html.includes("idSpanClasseDescricao");
    const bloqueado = html.includes("Just a moment") || html.includes("cf-chl") || html.includes("challenge-platform");

    console.log("\n=== DIAGNOSTICO ===");
    console.log(`  Passou Cloudflare (achou estrutura)?  ${passouCF ? 'SIM' : 'NAO'}`);
    console.log(`  Bloqueado por Cloudflare?              ${bloqueado ? 'SIM' : 'NAO'}`);

    if (passouCF) {
        try {
            const nome = await page.$eval('#idSpanClasseDescricao', el => el.textContent?.trim());
            const reg = await page.$eval('#idSpanNumeroRegistro', el => el.textContent?.trim());
            console.log(`  Processo: ${nome}`);
            console.log(`  Registro: ${reg}`);
        } catch (e) { console.log(`  Erro extraindo: ${e.message}`); }
    }
} catch (e) {
    console.log(`  ERRO navegação: ${e.message}`);
}

await browser.close();
console.log("\nFIM");
