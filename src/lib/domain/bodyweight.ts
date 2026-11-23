/**
 * Ποιο σωματικό βάρος ισχύει για μια μέρα προπόνησης — ΜΙΑ πηγή για PR,
 * charts και backfill.
 *
 * 1. Η τελευταία μέτρηση ΜΕΧΡΙ τη μέρα (ποτέ από το «μέλλον» χωρίς σήμανση).
 * 2. Αλλιώς η πλησιέστερη ΜΕΤΑΓΕΝΕΣΤΕΡΗ μέτρηση εντός `LATER_WINDOW_DAYS` —
 *    επιστρέφεται ως `approximate: true` ώστε ο caller να το σημάνει (π.χ.
 *    «κατά προσέγγιση»), όχι να το περάσει σιωπηλά για πραγματικό βάρος.
 * 3. Αλλιώς null — κανένα επινοημένο νούμερο.
 */
export const LATER_WINDOW_DAYS = 60;

export interface BodyweightSample {
  /** τοπική ημερομηνία YYYY-MM-DD */
  date: string;
  weight_kg: number | null;
}

export interface ResolvedBodyweight {
  kg: number;
  approximate: boolean;
}

function dayNumber(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / 86_400_000);
}

/** `history` ταξινομημένο αύξουσα ως προς date, μόνο μετρήσεις με βάρος. */
export function resolveBodyweight(
  history: ReadonlyArray<BodyweightSample>,
  day: string,
): ResolvedBodyweight | null {
  let before: number | null = null;
  for (const r of history) {
    if (r.weight_kg == null) continue;
    if (r.date > day) {
      // πρώτη μεταγενέστερη = πλησιέστερη (η λίστα είναι αύξουσα)
      if (before != null) return { kg: before, approximate: false };
      return dayNumber(r.date) - dayNumber(day) <= LATER_WINDOW_DAYS
        ? { kg: r.weight_kg, approximate: true }
        : null;
    }
    before = r.weight_kg;
  }
  return before != null ? { kg: before, approximate: false } : null;
}
