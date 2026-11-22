import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';

/**
 * Αναδιάταξη βήματος πάνω/κάτω. Ξαναγράφει ΟΛΗ τη σειρά (step_number 1..n)
 * και την αλυσίδα prerequisites, σε μία transaction, ώστε να μη μείνει τρύπα.
 *
 * Αν το skill έχει ζωντανή πρόοδο, ευθυγραμμίζουμε και το current_step_id με
 * το πρώτο μη-ολοκληρωμένο βήμα της νέας σειράς — αλλιώς ο δείκτης θα έδειχνε
 * σε θέση που άλλαξε. Τα mastered skills δεν αγγίζονται.
 */
export async function moveSkillStep(
  skillId: string,
  stepId: string,
  direction: -1 | 1,
): Promise<boolean> {
  const uid = getCurrentUserId();
  const steps = (
    await db.skill_steps.where('skill_id').equals(skillId).sortBy('step_number')
  ).filter((step) => step.deleted_at == null);
  const index = steps.findIndex((step) => step.id === stepId);
  const target = index + direction;
  if (index === -1 || target < 0 || target >= steps.length) return false;

  const ordered = [...steps];
  const moved = ordered[index]!;
  ordered[index] = ordered[target]!;
  ordered[target] = moved;

  const completions = await db.user_skill_step_completions
    .where('user_id')
    .equals(uid)
    .toArray();
  const done = new Set(
    completions.filter((row) => row.deleted_at == null).map((row) => row.skill_step_id),
  );
  const t = new Date().toISOString();

  await db.transaction(
    'rw',
    [db.skill_steps, db.user_skill_progress],
    async () => {
      for (let i = 0; i < ordered.length; i += 1) {
        const step = ordered[i]!;
        const prev = i === 0 ? null : ordered[i - 1]!;
        await db.skill_steps.update(step.id, {
          step_number: i + 1,
          prerequisites: prev ? [prev.id] : [],
          updated_at: t,
        });
      }
      const progress = await db.user_skill_progress
        .where('[user_id+skill_id]')
        .equals([uid, skillId])
        .first();
      if (!progress || progress.deleted_at != null || progress.status === 'mastered') return;
      const firstOpen = ordered.find((step) => !done.has(step.id)) ?? ordered[ordered.length - 1];
      await db.user_skill_progress.update(progress.id, {
        current_step_id: firstOpen?.id ?? null,
        updated_at: t,
      });
    },
  );
  return true;
}
