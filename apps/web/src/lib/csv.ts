/**
 * Minimal RFC 4180-ish CSV parser — handles quoted fields, escaped quotes
 * (""), and commas/newlines inside quotes. No external dependency needed
 * for the simple "phone, name, var1, var2..." shape broadcast CSVs use.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && next === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim().length > 0));
}

export interface ParsedCsvRecipient {
  waId: string;
  name?: string;
  templateVariables: string[];
  rowNumber: number;
  error?: string;
}

/**
 * Interprets parsed CSV rows as broadcast recipients. First row is treated
 * as a header if its first cell looks non-numeric (e.g. "phone"/"waId"
 * rather than a number) and is skipped; remaining columns after
 * phone/name become positional template variables in order.
 */
export function csvRowsToRecipients(rows: string[][]): ParsedCsvRecipient[] {
  if (rows.length === 0) return [];

  const firstCell = rows[0][0]?.trim() ?? "";
  const hasHeader = !/^\d{7,15}$/.test(firstCell.replace(/^\+/, ""));
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const startRowNumber = hasHeader ? 2 : 1;

  return dataRows.map((cells, idx) => {
    const rowNumber = startRowNumber + idx;
    const rawPhone = (cells[0] ?? "").trim().replace(/^\+/, "").replace(/[\s-]/g, "");
    const name = cells[1]?.trim() || undefined;
    const templateVariables = cells.slice(2).map((c) => c.trim());

    if (!/^\d{7,15}$/.test(rawPhone)) {
      return { waId: rawPhone, name, templateVariables, rowNumber, error: "Invalid phone number (expected digits with country code)" };
    }

    return { waId: rawPhone, name, templateVariables, rowNumber };
  });
}
