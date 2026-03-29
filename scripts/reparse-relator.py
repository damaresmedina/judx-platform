"""
reparse-relator.py — Preenche campo 'relator' a partir do campo 'gabinete' nos CSVs existentes.
Não baixa nada. Só reescreve os CSVs com parser melhorado.

Regras de extração:
1. GABINETE DO MINISTRO/MINISTRA X → X
2. GABINETE DO DESEMBARGADOR CONVOCADO X → DESEMB. CONV. X
3. PRESIDÊNCIA → PRESIDENTE DO STJ
4. VICE-PRESIDÊNCIA → VICE-PRESIDENTE DO STJ
5. PRESIDENTE DA TERCEIRA SEÇÃO → PRESIDENTE DA 3ª SEÇÃO
6. Superior Tribunal de Justiça → (vazio, sem info)
7. DESEMBARGADOR CONVOCADO X → DESEMB. CONV. X
"""
import csv, os, glob, re, shutil

dir_path = r"C:\Users\medin\Desktop\backup_judx\resultados\stj_datajud"
files = sorted(glob.glob(os.path.join(dir_path, "stj_datajud_*.csv")))

def extrair_relator(gabinete):
    """Parser melhorado: extrai relator de qualquer formato de gabinete"""
    if not gabinete:
        return ""
    g = gabinete.strip()

    # 1. GABINETE DO MINISTRO/MINISTRA NOME
    m = re.search(r"GABINETE\s+D[OA]\s+MINISTR[OA]\s+(.+)", g, re.I)
    if m:
        return m.group(1).strip()

    # 2. GABINETE DO DESEMBARGADOR CONVOCADO (DO TRF/TJ...) NOME
    m = re.search(r"GABINETE\s+D[OA]\s+DESEMBARGADOR[A]?\s+CONVOCAD[OA]\s+(?:DO\s+\S+\s+)?(.+)", g, re.I)
    if m:
        nome = m.group(1).strip()
        # Limpar sufixo entre parênteses: "MANOEL DE OLIVEIRA ERHARDT (TRIBUNAL REGIONAL..."
        nome = re.sub(r"\s*\(.*$", "", nome).strip()
        return "DESEMB. CONV. " + nome

    # 3. DESEMBARGADOR CONVOCADO NOME (sem GABINETE)
    m = re.search(r"^DESEMBARGADOR[A]?\s+CONVOCAD[OA]\s+(.+)", g, re.I)
    if m:
        nome = re.sub(r"\s*\(.*$", "", m.group(1).strip()).strip()
        return "DESEMB. CONV. " + nome

    # 4. PRESIDÊNCIA
    if re.search(r"PRESID.NCIA$", g, re.I):
        return "PRESIDENTE STJ"

    # 5. VICE-PRESIDÊNCIA
    if re.search(r"VICE.PRESID.NCIA$", g, re.I):
        return "VICE-PRESIDENTE STJ"

    # 6. PRESIDENTE DA TERCEIRA SEÇÃO etc
    m = re.search(r"PRESIDENTE\s+D[AOA]\s+(.+)", g, re.I)
    if m:
        return "PRESIDENTE " + m.group(1).strip()

    # 7. "Superior Tribunal de Justiça" genérico — sem info útil
    if "superior tribunal" in g.lower():
        return ""

    # 8. Qualquer outro — retornar o gabinete inteiro como fallback
    return g


total_files = 0
total_recs = 0
total_preenchidos = 0
total_novos = 0

for fp in files:
    fname = os.path.basename(fp)
    m = re.search(r"(\d{4})", fname)
    ano = int(m.group(1)) if m else 0

    # Ler CSV inteiro
    rows = []
    fieldnames = None
    with open(fp, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        for row in reader:
            rows.append(row)

    if not fieldnames or "relator" not in fieldnames or "gabinete" not in fieldnames:
        print(f"  {fname}: sem campos relator/gabinete, pulando")
        continue

    novos = 0
    ja_tinha = 0
    for row in rows:
        rel = (row.get("relator", "") or "").strip()
        gab = (row.get("gabinete", "") or "").strip()

        if rel:
            ja_tinha += 1
        elif gab:
            novo_rel = extrair_relator(gab)
            if novo_rel:
                row["relator"] = novo_rel
                novos += 1

    # Reescrever CSV
    tmp = fp + ".tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    # Substituir original
    shutil.move(tmp, fp)

    total_files += 1
    total_recs += len(rows)
    total_preenchidos += ja_tinha
    total_novos += novos

    pct_antes = round(ja_tinha / len(rows) * 100, 1) if rows else 0
    pct_depois = round((ja_tinha + novos) / len(rows) * 100, 1) if rows else 0
    print(f"  {fname}: {len(rows):>7,} rows | relator antes: {ja_tinha:>6,} ({pct_antes}%) | +{novos:>5,} novos | depois: {pct_depois}%")

print(f"\n=== RESUMO ===")
print(f"Arquivos: {total_files}")
print(f"Registros: {total_recs:,}")
print(f"Ja tinham relator: {total_preenchidos:,}")
print(f"Novos preenchidos: {total_novos:,}")
print(f"Antes: {round(total_preenchidos/total_recs*100,1)}% | Depois: {round((total_preenchidos+total_novos)/total_recs*100,1)}%")
