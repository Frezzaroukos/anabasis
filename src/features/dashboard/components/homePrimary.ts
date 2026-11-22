/**
 * Το κύριο κουμπί της Αρχικής διαλέγει ΜΙΑ ενέργεια:
 *  - συνέχεια, αν υπάρχει ανοιχτή προπόνηση
 *  - έναρξη της πρώτης προγραμματισμένης σήμερα
 *  - αλλιώς έναρξη κενής σημερινής συνεδρίας
 *
 * `undefined` σε active ή στη λίστα = ακόμα φορτώνει. Δεν μαντεύουμε «έναρξη»
 * πριν απαντήσει η βάση, αλλιώς το κουμπί αναβοσβήνει από Start σε Continue.
 */

export type HomePrimaryAction =
  | { kind: 'loading' }
  | { kind: 'continue' }
  | { kind: 'scheduled'; sessionId: string; title: string }
  | { kind: 'start' };

export function homePrimaryAction(
  active: { id: string } | null | undefined,
  planned: Array<{ id: string; title: string; status: string }> | undefined,
): HomePrimaryAction {
  if (active === undefined || planned === undefined) return { kind: 'loading' };
  if (active != null) return { kind: 'continue' };
  const first = planned.find((session) => session.status === 'planned');
  if (first) return { kind: 'scheduled', sessionId: first.id, title: first.title };
  return { kind: 'start' };
}
