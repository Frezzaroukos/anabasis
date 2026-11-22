/**
 * Ένωση δύο ασκήσεων σε μία (owner: «να μην υπάρχουν δύο επιλογές, π.χ. pull ups
 * ΚΑΙ weighted pull ups»). Το σωστό μοντέλο του Anabasis είναι ΜΙΑ άσκηση που τη
 * λογάρεις bodyweight Ή με πρόσθετο βάρος (per-set)· τα διπλά entries σπάνε το
 * chart σε δύο γραμμές. Η ένωση **ξαναγονεϊκοποιεί** ΟΛΑ τα πραγματικά δεδομένα
 * της πηγής στον στόχο — μηδέν ψεύτικα δεδομένα — και μετά αρχειοθετεί την
 * (άδεια πλέον) πηγή.
 *
 * Μετά τη μεταφορά ΞΑΝΑΫΠΟΛΟΓΙΖΟΝΤΑΙ τα PR και των δύο ασκήσεων: το re-parent
 * των personal_records δεν αρκεί γιατί ο στόχος κρατάει ΜΟΝΟ ένα PR ανά τύπο —
 * αν η πηγή είχε ήδη `max_weight` και ο στόχος το δικό του, το αφελές re-parent
 * άφηνε δύο ζωντανά rows ίδιου τύπου (διπλό «ρεκόρ» στο UI). Το recompute
 * ξαναχτίζει ένα σωστό σύνολο μόνο από τα live σετ.
 *
 * Ξεχωριστό αρχείο (ΟΧΙ queries.ts) λόγω του oxc parse-threshold.
 */
import { db } from './schema';
import { recomputePRsForExercise } from './queries';

const now = () => new Date().toISOString();

export interface MergeImpact {
  sets: number;
  prs: number;
  programs: number;
  goals: number;
  total: number;
}

/**
 * Πόσες εγγραφές θα μετακινηθούν από την πηγή στον στόχο. Το UI το δείχνει στο
 * ConfirmDialog πριν την ένωση («θα μετακινηθούν N σετ, M στόχοι…»).
 */
export async function getMergeImpact(sourceId: string, targetId: string): Promise<MergeImpact> {
  if (!sourceId || !targetId || sourceId === targetId) {
    return { sets: 0, prs: 0, programs: 0, goals: 0, total: 0 };
  }
  const [sets, prs, programs, goals] = await Promise.all([
    db.sets.where('exercise_id').equals(sourceId).filter((s) => s.deleted_at == null).count(),
    db.personal_records
      .where('exercise_id')
      .equals(sourceId)
      .filter((r) => r.deleted_at == null)
      .count(),
    db.program_exercises
      .where('exercise_id')
      .equals(sourceId)
      .filter((r) => r.deleted_at == null)
      .count(),
    db.goals
      .where('exercise_id')
      .equals(sourceId)
      .filter((g) => g.deleted_at == null)
      .count(),
  ]);
  return { sets, prs, programs, goals, total: sets + prs + programs + goals };
}

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
      // Στη συνέχεια το recompute (έξω από το tx) τα συμπτύσσει σε ένα σωστό
      // σύνολο ανά τύπο — βλ. σχόλιο κεφαλής.
      await db.personal_records
        .where('exercise_id')
        .equals(sourceId)
        .modify({ exercise_id: targetId, updated_at: t });
      // Αναφορές σε προγράμματα → δείχνουν στην ενωμένη άσκηση. ΠΡΕΠΕΙ να μπει
      // updated_at: το program_exercises συγχρονίζεται φιλτραρισμένο σε updated_at,
      // αλλιώς σε άλλη συσκευή το πρόγραμμα θα δείχνει ακόμα την αρχειοθετημένη πηγή.
      await db.program_exercises
        .where('exercise_id')
        .equals(sourceId)
        .modify({ exercise_id: targetId, updated_at: t });
      // Στόχοι δεμένοι στην πηγή ακολουθούν — ΜΕ dedup: αν ο στόχος έχει ήδη
      // ισοδύναμο goal (ίδιο metric+period) για την ίδια άσκηση, soft-delete το
      // διπλότυπο της πηγής αντί να μείνουν δύο στόχοι για το ίδιο πράγμα.
      const targetGoals = await db.goals
        .where('exercise_id')
        .equals(targetId)
        .filter((g) => g.deleted_at == null)
        .toArray();
      const seen = new Set(targetGoals.map((g) => `${g.metric}|${g.period}`));
      const sourceGoals = await db.goals
        .where('exercise_id')
        .equals(sourceId)
        .filter((g) => g.deleted_at == null)
        .toArray();
      for (const g of sourceGoals) {
        const key = `${g.metric}|${g.period}`;
        if (seen.has(key)) {
          await db.goals.update(g.id, { deleted_at: t, updated_at: t });
        } else {
          await db.goals.update(g.id, { exercise_id: targetId, updated_at: t });
          seen.add(key);
        }
      }
      // Η πηγή είναι πλέον κενή → αρχειοθέτηση (όχι διαγραφή· αναστρέψιμο).
      await db.exercises.update(sourceId, { is_archived: true, updated_at: t });
    },
  );

  // Recompute ΕΞΩ από το transaction (ανοίγει δικό του, μόνο personal_records):
  // ο στόχος ξαναχτίζει ένα PR ανά τύπο από τα live σετ· η πηγή καθαρίζει τα
  // τυχόν ορφανά της (πρακτικά κανένα — μετακινήθηκαν όλα).
  await recomputePRsForExercise(targetId);
  await recomputePRsForExercise(sourceId);
}
