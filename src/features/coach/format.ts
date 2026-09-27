/**
 * Coach mode — μορφοποίηση (i18n + μονάδες) των δομημένων προτάσεων του coach.ts.
 *
 * Το domain (coach.ts) επιστρέφει καθαρά δεδομένα (kind + νούμερα)· εδώ γίνονται
 * localized strings. ΕΝΑ σημείο μορφοποίησης, κοινό για ExerciseCard hint,
 * Next Moves panel και Deload card — ώστε το ίδιο σήμα να δείχνει ίδιο παντού.
 */

import type { TFunction } from 'i18next';
import type { DeloadReason, MoveDescriptor } from '@/lib/domain/coach';

/**
 * formatMove — δομημένη κίνηση → localized «+X → Y».
 * @param fmtWeight μορφοποιεί kg στη μονάδα του χρήστη (π.χ. formatWeight(kg, unit)).
 */
export function formatMove(
  move: MoveDescriptor,
  t: TFunction,
  fmtWeight: (kg: number) => string,
): string {
  switch (move.kind) {
    case 'add_weight':
      return t('settings.coach.hint.addWeight', {
        increment: fmtWeight(move.incrementKg),
        weight: fmtWeight(move.weightKg),
      });
    case 'add_rep':
      return t('settings.coach.hint.addRep', { reps: move.reps });
    case 'add_hold':
      return t('settings.coach.hint.addHold', {
        delta: move.deltaSeconds,
        target: move.targetSeconds,
        sec: t('common.sec'),
      });
    case 'skill_step':
      return t('settings.coach.hint.skillStep', { step: move.step, max: move.max });
  }
}

/**
 * formatDeloadReason — δομημένη αιτία deload → localized πρόταση.
 */
export function formatDeloadReason(reason: DeloadReason, t: TFunction): string {
  return reason.code === 'volume'
    ? t('settings.coach.deload.volumeWarning', { percent: reason.percent, rpe: reason.rpe })
    : t('settings.coach.deload.consecutiveDays', { days: reason.days });
}
