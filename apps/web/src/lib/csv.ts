/** Picks the most likely delimiter from the header line (comma, semicolon or tab). */
export function detectDelimiter(text: string): string {
  const firstLine = text.replace(/^\uFEFF/, "").split(/\r?\n/, 1)[0] ?? "";
  const counts = [",", ";", "\t"].map((d) => ({ d, n: firstLine.split(d).length - 1 }));
  counts.sort((a, b) => b.n - a.n);
  return counts[0] && counts[0].n > 0 ? counts[0].d : ",";
}

/**
 * Minimal RFC-4180 CSV parser: quoted fields, escaped quotes (""), embedded
 * delimiters/newlines, CRLF or LF, and a leading BOM. Blank lines are skipped.
 */
export function parseCSV(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");

  const endRow = () => {
    row.push(value);
    value = "";
    if (row.some((cell) => cell.trim() !== "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"') {
      if (quoted && src[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && src[i + 1] === "\n") i += 1;
      endRow();
    } else {
      value += ch;
    }
  }
  if (value !== "" || row.length > 0) endRow();
  return rows;
}

/** Quotes a value for CSV output and neutralises spreadsheet formula injection. */
export function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
