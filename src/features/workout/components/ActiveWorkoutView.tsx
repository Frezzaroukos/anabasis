import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router-dom';
import { Link2, Plus, Save, Trash2, Weight } from 'lucide-react';
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
import { getActivity, getLatestBodyweight, localDay, saveBodyMetric } from '@/lib/db/queries';
import { useWakeLock } from '../useWakeLock';
import { SessionTimer } from './SessionTimer';
import { ExerciseCard } from './ExerciseCard';
import { AddExerciseSheet } from './AddExerciseSheet';
import { readStopwatchSeconds, clearStopwatch } from '@/hooks/useManualStopwatch';
import { PlateCalculator } from './PlateCalculator';
import { BottomSheet } from '@/components/ui/sheet';
import { ActivityLogForm } from './ActivityLogForm';
import { useAppSettings } from '@/hooks/useAppSettings';
import { parseWeightToKg, toDisplayWeight } from '@/lib/units';


function pendingKey(workoutId: string): string {
  return `anabasis.pendingExercises.${workoutId}`;
}

function readPendingIds(workoutId: string): string[] {
  try {
    const raw = globalThis.localStorage?.getItem(pendingKey(workoutId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writePendingIds(workoutId: string, ids: string[]): void {
  try {
    globalThis.localStorage?.setItem(pendingKey(workoutId), JSON.stringify(ids));
  } catch {
    /* private mode */
  }
}

function clearPendingIds(workoutId: string): void {
  try {
    globalThis.localStorage?.removeItem(pendingKey(workoutId));
  } catch {
    /* private mode */
  }
}

interface ActiveWorkoutViewProps {
  workout: Workout;
}

export function ActiveWorkoutView({ workout }: ActiveWorkoutViewProps) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const location = useLocation();
  const navigate = useNavigate();
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
  const setsQuery = useWorkoutSets(workout.id);
  const sets = useMemo(() => setsQuery ?? [], [setsQuery]);
  const persistedQuery = useWorkoutExerciseIds(workout.id);
  const persistedExerciseIds = useMemo(() => persistedQuery ?? [], [persistedQuery]);
  // Η δομή του προγράμματος, αν η προπόνηση είναι δεμένη σε ένα. Χωρίς αυτό η
  // οθόνη άνοιγε ΑΔΕΙΑ ακόμα κι όταν διάλεγες «Upper» από το ημερολόγιο.
  const plan = useLiveQuery(
    () => getWorkoutPlan(workout),
    [workout.program_id, workout.program_day_id],
    [],
  );
  const exercisesQuery = useExercises();
  const exercises = useMemo(() => exercisesQuery ?? [], [exercisesQuery]);

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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [bodyweightOpen, setBodyweightOpen] = useState(false);
  const [bodyweightInput, setBodyweightInput] = useState('');
  const [workoutType, setWorkoutType] = useState(workout.workout_type ?? '');
  const workoutTypeDirty = useRef(false);
  // Αυξάνει κάθε φορά που καταγράφεται νέο σετ (από οποιαδήποτε κάρτα
  // άσκησης) — trigger για το auto-start του rest timer παρακάτω.

  useEffect(() => {
    if (workoutTypeDirty.current) return;
    setWorkoutType(workout.workout_type ?? '');
  }, [workout.workout_type]);

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

  // Quick start από το Calendar (π.χ. «Σπίτι · bodyweight») φέρνει ονόματα
  // ασκήσεων. Τα προσθέτουμε ΜΙΑ φορά στο pending του active session, ώστε ο
  // χρήστης να βρει έτοιμες τις ασκήσεις χωρίς να ψάχνει στο picker.
  const seededRef = useRef(false);
  const seededIds = useRef(new Set<string>());
  useEffect(() => {
    if (seededRef.current) return;
    const names = (location.state as { seedExercises?: string[] } | null)?.seedExercises;
    if (!names?.length || exercises.length === 0) return;
    const seeded = names
      .map((name) => exercises.find((ex) => ex.name === name))
      .filter((ex): ex is Exercise => ex != null);
    if (seeded.length === 0) return;
    seededRef.current = true;
    for (const ex of seeded) seededIds.current.add(ex.id);
    setPending((cur) => [
      ...cur,
      ...seeded.filter((ex) => !orderedIds.includes(ex.id) && !cur.some((p) => p.id === ex.id)),
    ]);
    setWeightedById((cur) => {
      const next = { ...cur };
      for (const ex of seeded) if (!(ex.id in next)) next[ex.id] = !ex.is_bodyweight;
      return next;
    });
  }, [exercises, location.state, orderedIds]);

  useEffect(() => {
    if (!bodyweightOpen) return;
    setBodyweightInput(
      bodyweightKg != null ? String(toDisplayWeight(bodyweightKg, unit, 'body')) : '',
    );
  }, [bodyweightOpen, bodyweightKg, unit]);

  const onSaveBodyweight = () => {
    const value = Number(bodyweightInput.replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) return;
    void saveBodyMetric(localDay(new Date(workout.started_at)), {
      weight_kg: parseWeightToKg(value, unit),
    });
    setBodyweightOpen(false);
  };

  const onWorkoutTypeBlur = () => {
    if (!workoutTypeDirty.current) return;
    const trimmed = workoutType.trim();
    void queries.setWorkoutType(workout.id, trimmed === '' ? null : trimmed);
  };

  const pendingHydrated = useRef(false);
  useEffect(() => {
    if (pendingHydrated.current || exercises.length === 0) return;
    pendingHydrated.current = true;
    const ids = readPendingIds(workout.id);
    if (ids.length === 0) return;
    const loaded = ids
      .map((id) => exerciseById.get(id))
      .filter((ex): ex is Exercise => ex != null);
    if (loaded.length === 0) return;
    setPending((cur) => [...cur, ...loaded.filter((ex) => !cur.some((p) => p.id === ex.id))]);
    setWeightedById((cur) => {
      const next = { ...cur };
      for (const ex of loaded) if (!(ex.id in next)) next[ex.id] = !ex.is_bodyweight;
      return next;
    });
  }, [exerciseById, exercises.length, workout.id]);

  useEffect(() => {
    if (!pendingHydrated.current) return;
    writePendingIds(workout.id, pending.map((ex) => ex.id));
  }, [pending, workout.id]);

  const ready = setsQuery !== undefined && persistedQuery !== undefined && exercisesQuery !== undefined;
  // Βλ. isEmptyDraftWorkout σχόλιο — άδειο draft απορρίπτεται, δεν «τελειώνει».
  const isEmpty = ready ? isEmptyDraftWorkout(isSetLogged, sets.length) : false;

  const finish = async () => {
    if (!ready) return;
    setConfirmEnd(false);
    // Χειροκίνητο χρονόμετρο: αν ο χρήστης το μέτρησε, ΑΥΤΟ είναι η διάρκεια
    // (τίμια — μόνο ο χρόνος που όντως μετρούσε)· αλλιώς πέφτει σε wall-clock.
    const manual = readStopwatchSeconds(workout.id);
    await queries.endWorkout(workout.id, manual > 0 ? manual : undefined);
    clearStopwatch(workout.id);
    clearPendingIds(workout.id);
    navigate(`/history/${workout.id}`, { replace: true });
  };

  const discard = async () => {
    if (!ready) return;
    setConfirmDiscard(false);
    await queries.softDeleteWorkout(workout.id);
    clearStopwatch(workout.id);
    clearPendingIds(workout.id);
    navigate('/calendar', { replace: true });
  };

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-background safe-top">
      {/* Βάθος αντί για γραμμή: bg-card πάνω στο bg-background του γονιού — η
          κεφαλίδα «ανεβαίνει», με μια hairline από κάτω για να κόβεται καθαρά
          από το scroll content. */}
      <header className="border-b border-border/60 bg-card px-4 py-3">
        <div className="mx-auto flex w-full max-w-md items-center justify-between gap-2 md:max-w-3xl lg:max-w-4xl">
        {/* Ο τίτλος είναι το headline — ο χρόνος είναι απλά ένα μικρό,
            μουντό detail δίπλα του, ΟΧΙ κυρίαρχο ρολόι (owner feedback). */}
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-xs uppercase tracking-wider text-muted-foreground">
            {t('workout.active')}
          </p>
          <SessionTimer workoutId={workout.id} />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-9 w-9 p-0 text-muted-foreground hover:text-destructive"
            aria-label={t('workout.discard')}
            title={t('workout.discard')}
            loading={!ready}
            onClick={() => setConfirmDiscard(true)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            loading={!ready}
            onClick={() => setConfirmEnd(true)}
          >
            <Save className="h-4 w-4" />
            {t('workout.saveWorkout')}
          </Button>
        </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 overflow-y-auto px-4 pt-3 pb-[calc(1.5rem+env(safe-area-inset-bottom))] md:max-w-3xl lg:max-w-4xl">
        <div className="mb-4">
          <Input
            value={workoutType}
            onChange={(e) => {
              workoutTypeDirty.current = true;
              setWorkoutType(e.target.value);
            }}
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

            {!ready ? (
              <div className="space-y-3" role="status" aria-label={t('common.loading')}>
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-xl bg-card" aria-hidden />
                ))}
              </div>
            ) : orderedIds.length === 0 ? (
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
                      startCollapsed={
                        exSets.length === 0 &&
                        (planByExerciseId.has(id) || seededIds.current.has(id))
                      }
                      onNeedBodyweight={() => setBodyweightOpen(true)}
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

      <BottomSheet
        open={bodyweightOpen}
        onClose={() => setBodyweightOpen(false)}
        title={t('workout.bodyweightTitle')}
      >
        <div className="space-y-3 px-4 pb-4">
          <p className="text-xs leading-relaxed text-muted-foreground">
            {t('workout.bodyweightHint')}
          </p>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              {t('body.weight')} ({unit})
            </span>
            <Input
              type="number"
              inputMode="decimal"
              value={bodyweightInput}
              onChange={(e) => setBodyweightInput(e.target.value)}
              className="h-11 font-mono tabular-nums"
            />
          </label>
          <Button className="w-full" onClick={onSaveBodyweight}>
            {t('common.save')}
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmEnd}
        title={isEmpty ? t('workout.emptySaveTitle') : t('workout.endConfirmTitle')}
        description={
          <>
            {isEmpty ? t('workout.emptySaveDesc') : t('workout.endConfirmDesc')}
            {pending.length > 0 && (
              <span className="mt-2 block text-xs text-muted-foreground">
                {t('workout.pendingWarning', { count: pending.length })}
              </span>
            )}
          </>
        }
        confirmLabel={isEmpty ? t('workout.saveEmpty') : t('workout.saveWorkout')}
        cancelLabel={t('common.cancel')}
        destructive={!isEmpty}
        onConfirm={() => void finish()}
        onCancel={() => setConfirmEnd(false)}
      />

      <ConfirmDialog
        open={confirmDiscard}
        title={t('workout.discardAnyConfirmTitle')}
        description={t('workout.discardAnyConfirmDesc')}
        confirmLabel={t('workout.discard')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void discard()}
        onCancel={() => setConfirmDiscard(false)}
      />
    </div>
  );
}
