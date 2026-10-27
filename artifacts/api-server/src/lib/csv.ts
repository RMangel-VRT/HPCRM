export interface CsvRecord { fields: string[]; line: number; error?: string }

/** Quote-aware splitter extracted from the QBO seed importer, extended to records.
 * Unquoted fields are trimmed (legacy behavior); quoted contents are preserved.
 * Errors attach to the record, so later valid records can still be imported.
 */
export function parseCsv(text: string): CsvRecord[] {
  const records: CsvRecord[] = [];
  text = text.replace(/^\uFEFF/, "");
  let fields: string[] = [], value = "", quoted = false, closed = false, wasQuoted = false;
  let line = 1, start = 1, recordStart = 0, error: string | undefined;
  const field = () => { fields.push(wasQuoted ? value : value.trim()); value = ""; closed = wasQuoted = false; };
  const record = () => {
    field();
    if (error || fields.some(v => v !== "")) records.push({ fields, line: start, ...(error ? { error } : {}) });
    fields = []; error = undefined;
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; }
        else { quoted = false; closed = true; }
      } else {
        value += ch;
        if (ch === "\n" || (ch === "\r" && text[i + 1] !== "\n")) line++;
      }
    } else if (ch === ",") field();
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record(); line++; start = line; recordStart = i + 1;
    } else if (ch === '"' && value === "" && !closed) { quoted = wasQuoted = true; }
    else {
      if (closed || ch === '"') error = "Malformed CSV quoting";
      value += ch;
    }
  }
  if (quoted) {
    error = "Unterminated quoted field";
    const tail = text.slice(recordStart);
    if (/[\r\n]/.test(tail)) {
      // No closing quote anywhere in the remaining file: do not lose every
      // later row behind the malformed opening quote. Re-synchronize physical
      // lines, retaining the original line numbers and reporting bad fragments.
      tail.split(/\r\n|\r|\n/).forEach((physicalLine, offset) => {
        for (const parsed of parseCsv(physicalLine)) records.push({ ...parsed, line: start + offset });
      });
      return records;
    }
  }
  if (value !== "" || fields.length || wasQuoted || error) record();
  return records;
}

export function parseCsvLine(line: string): string[] {
  return parseCsv(line)[0]?.fields ?? [""];
}

export function writeCsv(rows: readonly (readonly (string | number | boolean | null | undefined)[])[]): string {
  return rows.map(row => row.map(value => {
    const text = value == null ? "" : String(value);
    return /[",\r\n]|^\s|\s$/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }).join(",")).join("\r\n") + "\r\n";
}

/** Exact decimal arithmetic, no rounding. Blank is unknown, not zero.
 * Accept $ prefix and correctly grouped thousands; reject signs/exponents,
 * malformed grouping, >2 decimals and values outside PostgreSQL int cents.
 */
export function dollarsToCents(input: string): number | null {
  const text = input.trim();
  if (!text) return null;
  if (!/^\$?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(text)) {
    throw new Error("Invalid dollar amount (use nonnegative dollars with at most two decimal places)");
  }
  const [whole, fraction = ""] = text.replace(/[$,]/g, "").split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > 2147483647n) throw new Error("Dollar amount exceeds the supported maximum");
  return Number(cents);
}

export function centsToDollars(value: number | null): string {
  return value === null ? "" : `${Math.floor(value / 100)}.${String(value % 100).padStart(2, "0")}`;
}
