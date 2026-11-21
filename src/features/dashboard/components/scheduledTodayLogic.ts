/**
 * Καθαρή απόφαση για το κουμπί κάθε planned row στην κάρτα «Σήμερα στο
 * πρόγραμμα»:
 *  - `start`    → δεν υπάρχει ενεργή προπόνηση
 *  - `continue` → υπάρχει ήδη ενεργή· το ίδιο κουμπί γίνεται «Συνέχεια»
 *  - `loading`  → το active-workout query δεν απάντησε ακόμη (disabled)
 *  - `none`     → το row δεν είναι πλέον planned
 *
 * Χωριστό pure module ώστε η απόφαση να έχει unit test χωρίς render/Dexie.
 */

export type ScheduledRowAction = 'start' | 'continue' | 'loading' | 'none';

export function scheduledRowAction(
  session: { status: 'planned' | 'done' | 'skipped' },
  activeWorkout: { id: string } | null | undefined,
): ScheduledRowAction {
  if (session.status !== 'planned') return 'none';
  if (activeWorkout === undefined) return 'loading';
  if (activeWorkout != null) return 'continue';
  return 'start';
}
