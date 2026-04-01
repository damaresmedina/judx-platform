import undetected_chromedriver as uc
import time, re

options = uc.ChromeOptions()
options.add_argument('--headless=new')
options.add_argument('--window-size=1920,1080')

driver = uc.Chrome(options=options, version_main=146)

url = 'https://processo.stj.jus.br/processo/pesquisa/?termo=2971391&aplicacao=processos.ea&tipoPesquisa=tipoPesquisaGenerica&chkordem=DESC&chkMorto=MORTO'
print('Navigating...')
driver.get(url)

title = driver.title
print(f'Title: {title}')
if 'moment' in title.lower():
    print('Cloudflare, waiting 15s...')
    time.sleep(15)
    title = driver.title
    print(f'After wait: {title}')

html = driver.page_source
print(f'HTML: {len(html)} chars')

partes = re.findall(r'(?:RECORRENTE|RECORRIDO|PARTE|Partes|RECTE|RECDO)[^<]{0,200}', html, re.I)
if partes:
    print('\n=== PARTES ===')
    for p in partes[:15]:
        print(f'  {p.strip()[:150]}')
else:
    print(html[:3000])

driver.quit()
