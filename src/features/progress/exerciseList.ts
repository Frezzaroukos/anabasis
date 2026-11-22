/**
 * Η λίστα ασκήσεων της Προόδου: οι ήδη προπονημένες πρώτα (πιο πρόσφατες
 * πάνω), οι «δεν έχει προπονηθεί ακόμα» χωριστά και αλφαβητικά — αλλιώς 41
 * ασκήσεις αλφαβητικά μπερδεύουν όσες έχουν ιστορικό με όσες δεν έχουν.
 */
export interface ListedExercise {
  id: string;
  name: string;
}

export function splitExerciseList<T extends ListedExercise>(
  exercises: readonly T[],
  summaries: ReadonlyMap<string, { lastTrainedAt: string | null }>,
): { trained: T[]; untrained: T[] } {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const trained: T[] = [];
  const untrained: T[] = [];
  for (const e of exercises) {
    (summaries.get(e.id)?.lastTrainedAt ? trained : untrained).push(e);
  }
  trained.sort(
    (a, b) =>
      summaries.get(b.id)!.lastTrainedAt!.localeCompare(summaries.get(a.id)!.lastTrainedAt!) ||
      byName(a, b),
  );
  untrained.sort(byName);
  return { trained, untrained };
}
