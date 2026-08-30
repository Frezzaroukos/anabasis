/** Δευτέρα της εβδομάδας του `d` — κοινό helper (WeekStrip + hero fallback). */
export function mondayOf(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (copy.getDay() + 6) % 7; // 0 = Δευτέρα
  copy.setDate(copy.getDate() - dow);
  return copy;
}
