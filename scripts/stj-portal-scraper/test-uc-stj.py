"""
Teste: undetected_chromedriver consegue bypassar Cloudflare Turnstile no portal STJ?
"""
import sys, time
sys.stdout.reconfigure(encoding='utf-8')

import undetected_chromedriver as uc

URL = "https://processo.stj.jus.br/processo/pesquisa/?termo=2971391&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO"

print("[1] subindo UC (headless=True)...", flush=True)
opts = uc.ChromeOptions()
opts.add_argument("--headless=new")
opts.add_argument("--disable-blink-features=AutomationControlled")
opts.add_argument("--window-size=1366,768")

t0 = time.time()
drv = uc.Chrome(options=opts, version_main=None)
print(f"  UP em {time.time()-t0:.1f}s", flush=True)

print("[2] navegando STJ portal...", flush=True)
t0 = time.time()
drv.get(URL)
time.sleep(6)  # deixar Turnstile resolver

# Salvar HTML
html = drv.page_source
size = len(html)
print(f"  HTML size: {size:,} bytes em {time.time()-t0:.1f}s", flush=True)

with open(r"C:\Users\medin\projetos\judx-platform\scripts\stj-portal-scraper\_test_output.html", "w", encoding="utf-8") as f:
    f.write(html)
print("  salvo em _test_output.html", flush=True)

# Sinais de que passou o Cloudflare
passou_cf = "idDetalhesPartesAdvogadosProcuradores" in html or "idSpanClasseDescricao" in html
bloqueado_cf = "Just a moment" in html or "cf-chl" in html or "challenge-platform" in html

print("\n=== DIAGNOSTICO ===", flush=True)
print(f"  Passou Cloudflare (encontrou estrutura do portal)?  {'SIM' if passou_cf else 'NAO'}", flush=True)
print(f"  Bloqueado por Cloudflare (Turnstile/challenge)?     {'SIM' if bloqueado_cf else 'NAO'}", flush=True)

# Se passou, tenta extrair info-chave
if passou_cf:
    try:
        from selenium.webdriver.common.by import By
        nome = drv.find_element(By.ID, "idSpanClasseDescricao").text
        registro = drv.find_element(By.ID, "idSpanNumeroRegistro").text
        print(f"  Processo: {nome}", flush=True)
        print(f"  Registro: {registro}", flush=True)
    except Exception as e:
        print(f"  Erro extraindo: {e}", flush=True)

drv.quit()
print("\nFIM", flush=True)
