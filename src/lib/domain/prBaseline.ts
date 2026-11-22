import type { PersonalRecord } from '../db/types';

/**
 * ΕΝΙΑΙΟΣ ορισμός «PR» για ό,τι ΜΕΤΡΑΕΙ ή ΔΕΙΧΝΕΙ ρεκόρ (λίστες, αρχική,
 * Data, XP): PR = ρεκόρ που ξεπέρασε ρεκόρ από ΠΡΟΗΓΟΥΜΕΝΗ προπόνηση.
 *
 * Ο πίνακας `personal_records` κρατά ΚΑΙ τα «baseline» rows — το πρώτο σετ ποτέ
 * μιας άσκησης (και ό,τι ξεπεράστηκε μέσα στην ίδια προπόνηση) — γιατί το επόμενο
 * σετ συγκρίνεται με αυτά. Δεν είναι όμως επίτευγμα: μια πρώτη προπόνηση με ένα
 * σετ δεν «έσπασε» τίποτα. Τα rows ΔΕΝ αλλάζουν· μόνο οι readers τα φιλτράρουν.
 *
 * Σύγκριση ανά (άσκηση|δραστηριότητα, τύπος): ένας νέος τύπος (π.χ. e1RM που
 * εμφανίζεται όταν προστεθεί βάρος) δεν έσπασε ρεκόρ που δεν υπήρχε.
 */
type PRLike = Pick<
  PersonalRecord,
  'exercise_id' | 'activity_kind' | 'type' | 'workout_id' | 'achieved_at' | 'deleted_at'
>;

const groupKey = (r: PRLike) => `${r.exercise_id ?? `act:${r.activity_kind ?? ''}`}|${r.type}`;

/** Τα rows που είναι πραγματικά σπασμένα ρεκόρ (όχι baseline). Δεν αλλάζει τη σειρά. */
export function realPRs<T extends PRLike>(rows: ReadonlyArray<T>): T[] {
  const groups = new Map<string, T[]>();
  for (const r of rows) {
    if (r.deleted_at != null) continue;
    const k = groupKey(r);
    const g = groups.get(k);
    if (g) g.push(r);
    else groups.set(k, [r]);
  }
  const real = new Set<T>();
  for (const g of groups.values()) {
    for (const r of g) {
      // Υπάρχει row ΑΛΛΗΣ προπόνησης που καταγράφηκε νωρίτερα;
      if (g.some((o) => o.workout_id !== r.workout_id && o.achieved_at < r.achieved_at)) real.add(r);
    }
  }
  return rows.filter((r) => real.has(r));
}

/** true όταν το row είναι baseline (πρώτο ρεκόρ του τύπου) — το αντίστροφο του realPRs. */
export function isBaselinePR<T extends PRLike>(row: T, all: ReadonlyArray<T>): boolean {
  return !realPRs(all).includes(row);
}
