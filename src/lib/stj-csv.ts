export function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQ = false;
      } else cur += c;
    } else if (c === '"') {
      inQ = true;
    } else if (c === sep) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

export function parseCsv(text: string, separator?: string): Record<string, string>[] {
  const normalized = text.replace(/^\ufeff/, "");
  const lines = normalized.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return [];
  const sep = separator ?? (lines[0].includes(";") ? ";" : ",");
  const headers = parseCsvLine(lines[0], sep).map((h) =>
    h.trim().replace(/^\ufeff/, "").toLowerCase(),
  );
  const rows: Record<string, string>[] = [];
  for (let li = 1; li < lines.length; li++) {
    const cells = parseCsvLine(lines[li], sep);
    const row: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = (cells[i] ?? "").trim();
    }
    rows.push(row);
  }
  return rows;
}

export function csvGet(row: Record<string, string>, ...keys: string[]): string {
  for (const k of keys) {
    const v = row[k.toLowerCase()];
    if (v != null && String(v).trim() !== "") return String(v).trim();
  }
  return "";
}
