/**
 * Ένωση δύο ασκήσεων σε μία (owner: «να μην υπάρχουν δύο επιλογές, π.χ. pull ups
 * ΚΑΙ weighted pull ups»). Το σωστό μοντέλο του Anabasis είναι ΜΙΑ άσκηση που τη
 * λογάρεις bodyweight Ή με πρόσθετο βάρος (per-set)· τα διπλά entries σπάνε το
 * chart σε δύο γραμμές. Η ένωση **ξαναγονεϊκοποιεί** ΟΛΑ τα πραγματικά δεδομένα
 * της πηγής στον στόχο — μηδέν recompute, μηδέν ψεύτικα δεδομένα, όλα τα PR events
 * διατηρούνται — και μετά αρχειοθετεί την (άδεια πλέον) πηγή.
 *
 * Ξεχωριστό αρχείο (ΟΧΙ queries.ts) λόγω του oxc parse-threshold.
 */
import { db } from './schema';

const now = () => new Date().toISOString();

/**
 * Μετακινεί sets, ιστορικό PR, αναφορές προγράμματος και στόχους από `sourceId`
 * στο `targetId`, και αρχειοθετεί την πηγή. Idempotent-safe· no-op αν ίδια/κενά.
 */
export async function mergeExercises(sourceId: string, targetId: string): Promise<void> {
  if (!sourceId || !targetId || sourceId === targetId) return;
  const t = now();

  await db.transaction(
    'rw',
    [db.sets, db.personal_records, db.program_exercises, db.goals, db.exercises],
    async () => {
      // Sets — η ουσία του chart. exercise_id → target (bump updated_at για sync LWW).
      await db.sets.where('exercise_id').equals(sourceId).modify({ exercise_id: targetId, updated_at: t });
      // Ιστορικό ρεκόρ — re-parent (όλα ήταν πραγματικά επιτεύγματα, μένουν).
      await db.personal_records
        .where('exercise_id')
        .equals(sourceId)
        .modify({ exercise_id: targetId, updated_at: t });
      // Αναφορές σε προγράμματα → δείχνουν στην ενωμένη άσκηση.
      await db.program_exercises.where('exercise_id').equals(sourceId).modify({ exercise_id: targetId });
      // Στόχοι δεμένοι στην πηγή ακολουθούν.
      await db.goals.where('exercise_id').equals(sourceId).modify({ exercise_id: targetId, updated_at: t });
      // Η πηγή είναι πλέον κενή → αρχειοθέτηση (όχι διαγραφή· αναστρέψιμο).
      await db.exercises.update(sourceId, { is_archived: true, updated_at: t });
    },
  );
}
