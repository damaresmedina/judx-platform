---
name: judx-report
description: "Generate empirical reports from JudX/ICONS data as Word (.docx) or PDF files. Use this skill when the user asks to produce a report, relatório, compilado, sumário, document findings, export results, or create a formatted output of analysis results. Also trigger when user says 'gera relatório', 'produz documento', 'exporta achados', 'monta o Word', or asks for formatted output of database queries."
---

# JudX Report — Geração de Relatórios Empíricos

Generate professional Word (.docx) or PDF reports from JudX and ICONS database findings.

## Dependencies

```bash
pip install python-docx  # Word generation
pip install reportlab     # PDF generation
pip install pymupdf       # PDF reading (fitz)
```

All are already installed in the user's environment.

## Word Report Pattern

Use `python-docx`. Save scripts to `C:\Users\medin\projetos\judx-platform\scripts\` and output to `C:\Users\medin\Desktop\`.

```python
from docx import Document
from docx.shared import Pt, RGBColor, Cm
from docx.enum.text import WD_ALIGN_PARAGRAPH

doc = Document()
# Style: Calibri 11pt, navy headings (#1a2a44)
# Tables: 'Light Grid Accent 1' style
# Notes: 9pt italic gray (#666666)
doc.save(r'C:\Users\medin\Desktop\report_name.docx')
```

## PDF Canvas Pattern (for visual/poster output)

Use `reportlab`. Fonts available: Calibri, CalibriLight, CalibriBold, Consolas (all in C:\Windows\Fonts\).

Color palette (Seismic Silence):
- Paper: #f0ebe0
- Ink/Navy: #1a2744
- Gold: #b8860b
- Red: #c0392b
- Muted: #8a8070

## Report Structure Convention

1. Cover page with title, date, corpus description
2. Table of contents
3. Sections with data tables (use `add_table` helper)
4. Footnotes as italic gray text
5. Methodology note at the end

## Data Access

Query the database live using the judx-query skill pattern (node + pg), capture results, then feed into the report generator. For reports based on conversation findings, compile from what's already been discussed — don't re-query unless needed.

## Reading PDFs

```python
import fitz  # pymupdf
doc = fitz.open(r'path\to\file.pdf')
for page in doc:
    text = page.get_text()
```

Note: `sys.stdout.reconfigure(encoding='utf-8')` is required on Windows to avoid encoding errors.
