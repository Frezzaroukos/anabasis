import type { SetType } from './db/types';

/**
 * Έτοιμα προγράμματα — «ένα tap και έχεις ρουτίνα». Οι ασκήσεις αναφέρονται
 * ΜΕ ΟΝΟΜΑ (matching το SEED_EXERCISES όπου γίνεται)· στο apply-time γίνεται
 * case-insensitive αντιστοίχιση στη βιβλιοθήκη σου και ό,τι λείπει δημιουργείται
 * ως δική σου άσκηση. Τα ονόματα/περιγραφές localιζονται μέσω i18n keys.
 */
export interface TemplateExercise {
  name: string;
  target_sets: number;
  target_reps: number | null;
  /** για isometric holds (π.χ. L-Sit) αντί για reps */
  target_hold_seconds?: number;
  set_type?: SetType;
  group_key?: string | null;
}

export interface ProgramTemplate {
  id: string;
  /** i18n keys — το UI τα μεταφράζει· fallback στο en. */
  nameKey: string;
  descriptionKey: string;
  /** Ενδεικτικός αριθμός ημερών/εβδομάδα — για την προεπισκόπηση. */
  daysPerWeek: number;
  exercises: TemplateExercise[];
}

const rep = (name: string, sets: number, reps: number): TemplateExercise => ({
  name,
  target_sets: sets,
  target_reps: reps,
});
const hold = (name: string, sets: number, seconds: number): TemplateExercise => ({
  name,
  target_sets: sets,
  target_reps: null,
  target_hold_seconds: seconds,
});

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: 'full-body-5x5',
    nameKey: 'templates.fullBody5x5.name',
    descriptionKey: 'templates.fullBody5x5.desc',
    daysPerWeek: 3,
    exercises: [
      rep('Back Squat', 5, 5),
      rep('Bench Press', 5, 5),
      rep('Barbell Row', 5, 5),
      rep('Overhead Press', 5, 5),
      rep('Deadlift', 1, 5),
    ],
  },
  {
    id: 'push-pull-legs',
    nameKey: 'templates.ppl.name',
    descriptionKey: 'templates.ppl.desc',
    daysPerWeek: 6,
    exercises: [
      rep('Bench Press', 4, 8),
      rep('Overhead Press', 3, 10),
      rep('Dips', 3, 10),
      rep('Deadlift', 3, 5),
      rep('Pull-ups', 4, 8),
      rep('Barbell Row', 3, 10),
      rep('Back Squat', 4, 8),
      rep('Romanian Deadlift', 3, 10),
      rep('Calf Raise', 4, 15),
    ],
  },
  {
    id: 'upper-lower',
    nameKey: 'templates.upperLower.name',
    descriptionKey: 'templates.upperLower.desc',
    daysPerWeek: 4,
    exercises: [
      rep('Bench Press', 4, 6),
      rep('Barbell Row', 4, 6),
      rep('Overhead Press', 3, 8),
      rep('Chin-ups', 3, 8),
      rep('Back Squat', 4, 6),
      rep('Romanian Deadlift', 3, 8),
      rep('Bulgarian Split Squat', 3, 10),
    ],
  },
  {
    id: 'calisthenics-foundations',
    nameKey: 'templates.calisthenics.name',
    descriptionKey: 'templates.calisthenics.desc',
    daysPerWeek: 3,
    exercises: [
      rep('Pull-ups', 4, 8),
      rep('Dips', 4, 10),
      rep('Inverted Rows', 3, 12),
      rep('Pike Push-ups', 3, 8),
      rep('Push-ups', 3, 15),
      hold('L-Sit', 3, 20),
      hold('Hollow Body Hold', 3, 30),
    ],
  },
  {
    id: 'beginner-barbell',
    nameKey: 'templates.beginnerBarbell.name',
    descriptionKey: 'templates.beginnerBarbell.desc',
    daysPerWeek: 3,
    exercises: [
      rep('Back Squat', 3, 5),
      rep('Bench Press', 3, 5),
      rep('Deadlift', 1, 5),
      rep('Overhead Press', 3, 5),
    ],
  },
  {
    id: 'dumbbell-3day',
    nameKey: 'templates.dumbbell3day.name',
    descriptionKey: 'templates.dumbbell3day.desc',
    daysPerWeek: 3,
    exercises: [
      rep('Bench Press', 3, 10),
      rep('Overhead Press', 3, 10),
      rep('Bulgarian Split Squat', 3, 12),
      rep('Romanian Deadlift', 3, 10),
      rep('Biceps Curls', 3, 12),
      rep('Triceps Extension', 3, 12),
    ],
  },
];

export function getTemplate(id: string): ProgramTemplate | undefined {
  return PROGRAM_TEMPLATES.find((t) => t.id === id);
}
