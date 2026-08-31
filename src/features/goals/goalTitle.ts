import type { TFunction } from 'i18next';
import type { Goal } from '@/lib/db/types';
import { METRIC_UNIT } from '@/lib/db/goals';

/**
 * Παράγει τον τίτλο ενός στόχου από τα πεδία του, όταν ο χρήστης δεν έδωσε
 * δικό του όνομα: «4 προπονήσεις / εβδομάδα», «20 km τρέξιμο / μήνα»,
 * «100 σετ · Έλξεις / μήνα».
 *
 * Γιατί συνάρτηση και όχι αποθηκευμένο string: αν ο χρήστης αλλάξει το ποσό
 * ή την περίοδο, ένας αποθηκευμένος τίτλος θα έλεγε ψέματα. Ο τίτλος είναι
 * παράγωγο των δεδομένων, όχι δεύτερο αντίγραφό τους.
 */
export function goalTitle(
  t: TFunction,
  goal: Pick<Goal, 'metric' | 'target' | 'period' | 'activity_key' | 'exercise_id'>,
  names: { activity?: string | null; exercise?: string | null; skill?: string | null } = {},
): string {
  // Milestone skill goal: «Κατέκτησε το Front Lever» — χωρίς περίοδο, το
  // ζητούμενο είναι το skill, όχι ένας ρυθμός.
  if (goal.metric === 'skill_steps') {
    const skill = names.skill ?? t('goals.metric.skill_steps');
    return t('goals.skillGoalTitle', { skill, count: goal.target });
  }

  // Milestone φορτίου: «Φτάσε 70 kg · Weighted Pull-up» — χωρίς περίοδο.
  if (goal.metric === 'top_weight') {
    const exercise = names.exercise ?? t('goals.metric.top_weight');
    return t('goals.loadGoalTitle', { load: goal.target, exercise });
  }

  const unit = METRIC_UNIT[goal.metric];

  // Με μονάδα, η μονάδα λέει ήδη τι μετράμε («20 km») — η λέξη «απόσταση»
  // θα ήταν πλεονασμός. Χωρίς μονάδα, τη λέξη τη χρειαζόμαστε («4 προπονήσεις»).
  const amount = unit
    ? `${goal.target} ${unit}`
    : `${goal.target} ${t(`goals.metric.${goal.metric}`).toLowerCase()}`;

  // Το εύρος μπαίνει μόνο όταν περιορίζει κάτι — «όλα» δεν αξίζει λέξη.
  const scope = names.exercise ?? names.activity ?? null;
  const withScope = scope ? `${amount} · ${scope}` : amount;

  return `${withScope} / ${t(`goals.period.${goal.period}`)}`;
}
