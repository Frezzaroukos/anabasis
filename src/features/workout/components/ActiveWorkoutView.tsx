import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Plus, Weight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { queries } from '@/lib/db';
import type { Exercise, Workout } from '@/lib/db/types';
import { useExercises } from '@/hooks/useExercises';
import { useWorkoutSets, useWorkoutExerciseIds } from '@/hooks/useWorkoutSets';
import { getWorkoutPlan } from '@/lib/db/schedule';
import { isEmptyDraftWorkout, isSetLoggedActivity, type SetChain } from '../utils';
import { useLiveQuery } from 'dexie-react-hooks';
import { getActivity, getLatestBodyweight, localDay } from '@/lib/db/queries';
import { useWakeLock } from '../useWakeLock';
import { SessionTimer } from './SessionTimer';
import { ExerciseCard } from './ExerciseCard';
import { AddExerciseSheet } from './AddExerciseSheet';
import { readStopwatchSeconds, clearStopwatch } from '@/hooks/useManualStopwatch';
import { PlateCalculator } from './PlateCalculator';
import { BottomSheet } from '@/components/ui/sheet';
import { ActivityLogForm } from './ActivityLogForm';

interface ActiveWorkoutViewProps {
  workout: Workout;
}

export function ActiveWorkoutView({ workout }: ActiveWorkoutViewProps) {
  const { t } = useTranslation();
  // Ρωτάμε τη ΔΡΑΣΤΗΡΙΟΤΗΤΑ αν καταγράφει σετ, αντί να ελέγχουμε ονόματα —
  // αλλιώς ένα δικό σου άθλημα δεν θα μπορούσε ποτέ να έχει σετ.
  const activity = useLiveQuery(
    () => getActivity(workout.activity_kind),
    [workout.activity_kind],
  );
  const isSetLogged = isSetLoggedActivity(activity, workout.activity_kind);
  // Σωματικό βάρος τη μέρα του workout — «φωτογραφίζεται» σε κάθε σετ άσκησης
  // σωματικού βάρους ώστε το φορτίο (bw + πρόσθετο) να είναι αληθινό στα charts.
  const bodyweightKg = useLiveQuery(
    () => getLatestBodyweight(localDay(new Date(workout.started_at))),
    [workout.started_at],
    null,
  );
  const sets = useWorkoutSets(workout.id);
  const persistedExerciseIds = useWorkoutExerciseIds(workout.id);
  // Η δομή του προγράμματος, αν η προπόνηση είναι δεμένη σε ένα. Χωρίς αυτό η
  // οθόνη άνοιγε ΑΔΕΙΑ ακόμα κι όταν διάλεγες «Upper» από το ημερολόγιο.
  const plan = useLiveQuery(
    () => getWorkoutPlan(workout),
    [workout.program_id, workout.program_day_id],
    [],
  );
  const exercises = useExercises();

  // Η οθόνη δεν πρέπει να κλειδώνει ανάμεσα σε σετ — όσο υπάρχει ενεργό workout.
  useWakeLock(true);

  // Pending = exercises added in this session that haven't received a set yet.
  // Memory-only by design: refresh discards them (sets persist).
  const [pending, setPending] = useState<Exercise[]>([]);
  const [weightedById, setWeightedById] = useState<Record<string, boolean>>({});
  const [chain, setChain] = useState<SetChain | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [plateOpen, setPlateOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [workoutType, setWorkoutType] = useState(workout.workout_type ?? '');
  // Αυξάνει κάθε φορά που καταγράφεται νέο σετ (από οποιαδήποτε κάρτα
  // άσκησης) — trigger για το auto-start του rest timer παρακάτω.

  const exerciseById = useMemo(() => {
    const m = new Map<string, Exercise>();
    for (const e of exercises) m.set(e.id, e);
    return m;
  }, [exercises]);

  const setsByExercise = useMemo(() => {
    const m = new Map<string, typeof sets>();
    for (const s of sets) {
      const arr = m.get(s.exercise_id) ?? [];
      arr.push(s);
      m.set(s.exercise_id, arr);
    }
    return m;
  }, [sets]);

  const planByExerciseId = useMemo(
    () => new Map(plan.map((row) => [row.exercise_id, row])),
    [plan],
  );

  const orderedIds = useMemo(() => {
    // Σειρά: (1) το πλάνο της μέρας όπως το έγραψες στο πρόγραμμα — αυτή είναι
    // η σειρά που θέλεις να δουλέψεις· (2) ό,τι λογάρισες εκτός πλάνου·
    // (3) ό,τι πρόσθεσες μόλις τώρα. Χωρίς πρόγραμμα το (1) είναι κενό και η
    // συμπεριφορά μένει ακριβώς όπως ήταν.
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      out.push(id);
    };
    for (const row of plan) push(row.exercise_id);
    for (const id of persistedExerciseIds) push(id);
    for (const e of pending) push(e.id);
    return out;
  }, [plan, persistedExerciseIds, pending]);

  // Drop pending entries once they get a set persisted.
  useEffect(() => {
    setPending((cur) => cur.filter((p) => !persistedExerciseIds.includes(p.id)));
  }, [persistedExerciseIds]);

  const onAddExercise = (ex: Exercise) => {
    if (orderedIds.includes(ex.id)) return;
    setPending((cur) => [...cur, ex]);
    setWeightedById((cur) => ({
      ...cur,
      [ex.id]: !ex.is_bodyweight, // BW exercises default to bodyweight mode
    }));
  };

  const onWorkoutTypeBlur = () => {
    const trimmed = workoutType.trim();
    void queries.setWorkoutType(workout.id, trimmed === '' ? null : trimmed);
  };

  // Βλ. isEmptyDraftWorkout σχόλιο — άδειο draft απορρίπτεται, δεν «τελειώνει».
  const isEmpty = isEmptyDraftWorkout(isSetLogged, sets.length);

  const onConfirmEnd = async () => {
    setConfirmEnd(false);
    if (isEmpty) {
      await queries.softDeleteWorkout(workout.id);
      clearStopwatch(workout.id);
    } else {
      // Χειροκίνητο χρονόμετρο: αν ο χρήστης το μέτρησε, ΑΥΤΟ είναι η διάρκεια
      // (τίμια — μόνο ο χρόνος που όντως μετρούσε)· αλλιώς πέφτει σε wall-clock.
      const manual = readStopwatchSeconds(workout.id);
      await queries.endWorkout(workout.id, manual > 0 ? manual : undefined);
      clearStopwatch(workout.id);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background safe-top">
      {/* Βάθος αντί για γραμμή: bg-card πάνω στο bg-background του γονιού — η
          κεφαλίδα «ανεβαίνει», με μια hairline από κάτω για να κόβεται καθαρά
          από το scroll content. */}
      <header className="flex items-center justify-between gap-2 border-b border-border/60 bg-card px-4 py-3">
        {/* Ο τίτλος είναι το headline — ο χρόνος είναι απλά ένα μικρό,
            μουντό detail δίπλα του, ΟΧΙ κυρίαρχο ρολόι (owner feedback). */}
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
            {t('workout.active')}
          </p>
          <SessionTimer workoutId={workout.id} />
        </div>
        <Button
          variant="destructive"
          size="sm"
          onClick={() => setConfirmEnd(true)}
          className="shrink-0"
        >
          <X className="h-4 w-4" />
          {isEmpty ? t('workout.discard') : t('workout.end')}
        </Button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">
        <div className="mb-4">
          <Input
            value={workoutType}
            onChange={(e) => setWorkoutType(e.target.value)}
            onBlur={onWorkoutTypeBlur}
            placeholder={t('workout.typePlaceholder')}
            className="h-9 text-sm"
          />
        </div>

        {isSetLogged ? (
          <>
            {chain && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-md border border-dashed border-primary/50 bg-primary/5 px-3 py-2 text-xs">
                <span className="flex items-center gap-1.5 font-medium text-primary">
                  <Link2 className="h-3.5 w-3.5" aria-hidden />
                  {t('workout.chain.activeBanner', { type: t(`setType.${chain.type}`) })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs"
                  onClick={() => setChain(null)}
                >
                  {t('workout.chain.end')}
                </Button>
              </div>
            )}

            {orderedIds.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                {t('workout.noExercises')}
              </p>
            ) : (
              <div className="space-y-3">
                {orderedIds.map((id) => {
                  const ex = exerciseById.get(id);
                  if (!ex) return null;
                  const exSets = setsByExercise.get(id) ?? [];
                  const weightedDefault = !ex.is_bodyweight;
                  const weighted = weightedById[id] ?? weightedDefault;
                  return (
                    <ExerciseCard
                      key={id}
                      exercise={ex}
                      workoutId={workout.id}
                      sets={exSets}
                      bodyweightKg={bodyweightKg}
                      weighted={weighted}
                      onWeightedChange={(next) =>
                        setWeightedById((cur) => ({ ...cur, [id]: next }))
                      }
                      chain={chain}
                      onChainChange={setChain}
                      target={planByExerciseId.get(id) ?? null}
                      // Οι ασκήσεις του πλάνου ξεκινούν κλειστές: αλλιώς ένα
                      // πρόγραμμα 10 ασκήσεων άνοιγε 10 φόρμες μαζί.
                      startCollapsed={planByExerciseId.has(id) && exSets.length === 0}
                    />
                  );
                })}
              </div>
            )}

            <div className="mt-4 flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setSheetOpen(true)}
              >
                <Plus className="h-4 w-4" />
                {t('workout.addExercise')}
              </Button>
              <Button
                variant="outline"
                aria-label={t('plate.target')}
                onClick={() => setPlateOpen(true)}
              >
                <Weight className="h-4 w-4" />
              </Button>
            </div>
          </>
        ) : (
          <ActivityLogForm workout={workout} />
        )}
      </div>

      {isSetLogged && (
        <AddExerciseSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onPick={onAddExercise}
          excludeIds={orderedIds}
        />
      )}

      {isSetLogged && (
        <BottomSheet open={plateOpen} onClose={() => setPlateOpen(false)} title={t('plate.target')}>
          <div className="px-4 pb-4">
            <PlateCalculator />
          </div>
        </BottomSheet>
      )}

      <ConfirmDialog
        open={confirmEnd}
        title={isEmpty ? t('workout.discardConfirmTitle') : t('workout.endConfirmTitle')}
        description={isEmpty ? t('workout.discardConfirmDesc') : t('workout.endConfirmDesc')}
        confirmLabel={isEmpty ? t('workout.discard') : t('workout.end')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void onConfirmEnd()}
        onCancel={() => setConfirmEnd(false)}
      />
    </div>
  );
}
