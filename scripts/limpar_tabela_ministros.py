"""Limpa todos os campos de texto do stf_175_ministros.csv:
  - remove acentos
  - remove HTML entities (&rsquo; &amp; etc)
  - normaliza aspas tipográficas
  - colapsa espaços múltiplos
  - uppercase nos nomes
"""
import csv, html, re, unicodedata
from pathlib import Path

SRC = Path("C:/Users/medin/Desktop/backup_judx/resultados/stf_175_ministros.csv")

def clean(s):
    if s is None or s == '': return ''
    s = str(s)
    s = html.unescape(s)                # &rsquo; → '
    s = s.replace('’',"'").replace('‘',"'").replace('“','"').replace('”','"')
    s = ''.join(c for c in unicodedata.normalize('NFKD', s) if not unicodedata.combining(c))
    s = re.sub(r'\s+', ' ', s).strip()
    return s

with open(SRC, encoding='utf-8') as f:
    rows = list(csv.DictReader(f))
    cols = list(rows[0].keys())

# campos de texto que são nomes/locais — uppercase
NOMES = {'nome_oficial','nome_completo_bio','nome_curto_bio'}

for r in rows:
    for c in cols:
        v = clean(r.get(c,''))
        if c in NOMES:
            v = v.upper()
        r[c] = v

with open(SRC, 'w', encoding='utf-8', newline='') as f:
    w = csv.DictWriter(f, fieldnames=cols)
    w.writeheader()
    for r in rows: w.writerow(r)

print(f"[ok] {SRC}  — {len(rows)} linhas limpas (sem acento, sem HTML)")
