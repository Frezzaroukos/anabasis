/**
 * Μικρός CSV tokenizer για τα exports των Strong/Hevy.
 *
 * Γιατί όχι βιβλιοθήκη: το app είναι offline-first και τα exports είναι
 * μικρά (λίγες χιλιάδες γραμμές) — ένα state machine 60 γραμμών καλύπτει
 * quotes/escapes/πολλαπλά delimiters χωρίς νέο dependency.
 *
 * Delimiter sniffing: το Strong σε Android εξάγει με «;», σε iOS με «,» —
 * μετράμε ποιο εμφανίζεται περισσότερο ΕΚΤΟΣ quotes στην πρώτη γραμμή,
 * ώστε ο χρήστης να μην χρειάζεται να ξέρει από ποια συσκευή ήρθε το αρχείο.
 */

export function sniffDelimiter(text: string): ',' | ';' {
  const firstLine = text.slice(0, text.indexOf('\n') === -1 ? text.length : text.indexOf('\n'));
  let commas = 0;
  let semis = 0;
  let inQuotes = false;
  for (const ch of firstLine) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && ch === ',') commas += 1;
    else if (!inQuotes && ch === ';') semis += 1;
  }
  return semis > commas ? ';' : ',';
}

/**
 * Parse σε rows από arrays. Χειρίζεται quoted πεδία με `""` escape και
 * newlines μέσα σε quotes (τα Notes του Strong συχνά έχουν πολλές γραμμές).
 */
export function parseCsv(text: string, delimiter?: ',' | ';'): string[][] {
  const delim = delimiter ?? sniffDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    // κενές γραμμές (π.χ. trailing newline) δεν είναι δεδομένα
    if (row.length > 1 || row[0]!.trim() !== '') rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1; // escaped quote
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      pushField();
    } else if (ch === '\n') {
      pushRow();
    } else if (ch !== '\r') {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

/**
 * Χαρτογραφεί header ονόματα σε στήλες, case-insensitive και αδιάφορο σε
 * κενά/underscores — «Workout Name», «workout_name» και «WORKOUT NAME»
 * είναι το ίδιο πράγμα. Επιστρέφει index ανά κανονικοποιημένο όνομα.
 */
export function headerIndex(headerRow: string[]): Map<string, number> {
  const map = new Map<string, number>();
  headerRow.forEach((h, i) => {
    const norm = h.trim().toLowerCase().replace(/[\s_]+/g, ' ');
    if (norm && !map.has(norm)) map.set(norm, i);
  });
  return map;
}
