import type { HeatCell } from '@/lib/db/queries';

/** Δευτέρα=0 … Κυριακή=6 — ίδια σύμβαση με mondayOf (weekMath.ts). */
function isoWeekdayIndex(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  return (date.getDay() + 6) % 7;
}

/**
 * Γεμίζει την αρχή της λίστας με κενά (null) ώστε η πρώτη πραγματική μέρα να
 * πέσει στη ΣΩΣΤΗ γραμμή εβδομάδας (Δευτ=0…Κυρ=6). Χωρίς αυτό, το heatmap
 * έκοβε απλώς 7-συνεχόμενες-μέρες χωρίς σχέση με πραγματικά όρια εβδομάδας —
 * η "γραμμή 0" άλλαζε νόημα ανάλογα με το ποια μέρα τυχαίνει να είναι σήμερα
 * κάθε φορά που φορτώνει το Dashboard, οπότε δεν μπορούσες ποτέ να διαβάσεις
 * με μια ματιά «τρένω περισσότερο Σαββατοκύριακα».
 */
export function alignToWeekday(cells: HeatCell[]): (HeatCell | null)[] {
  if (cells.length === 0) return [];
  const leadingBlanks = isoWeekdayIndex(cells[0]!.date);
  return [...(Array(leadingBlanks).fill(null) as null[]), ...cells];
}

/** Χωρίζει μια ΗΔΗ ευθυγραμμισμένη λίστα (βλ. alignToWeekday) σε στήλες-εβδομάδες των 7. */
export function chunkIntoWeeks(aligned: (HeatCell | null)[]): (HeatCell | null)[][] {
  const weeks: (HeatCell | null)[][] = [];
  for (let i = 0; i < aligned.length; i += 7) weeks.push(aligned.slice(i, i + 7));
  return weeks;
}
