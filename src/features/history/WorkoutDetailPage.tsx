import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronDown, ChevronRight, ChevronUp, ClipboardPaste, Copy, Pencil, Plus, Repeat, SlidersHorizontal, Trophy, Trash2, X, Zap } from 'lucide-react';
import {
  addSet,
  getLatestBodyweight,
  getWorkoutDetail,
  localDay,
  moveSetToExercise,
  removeExerciseFromWorkout,
  reorderWorkoutExercises,
  startWorkoutFromCompleted,
} from '@/lib/db/queries';
import { addQuickSets } from '@/lib/db/workoutHelpers';
import { restoreExerciseInWorkout } from '@/lib/db/workoutRestore';
import { formatHMS } from '@/hooks/useSessionTimer';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useExercises } from '@/hooks/useExercises';
import { formatWeight, toDisplayWeight } from '@/lib/units';
import { parseQuickSets } from '@/features/workout/quickLog';
import { AddSetInline, type SetIntensity } from '@/features/workout/components/AddSetInline';
import { SetRow } from '@/features/workout/components/SetRow';
import { AddExerciseSheet } from '@/features/workout/components/AddExerciseSheet';
import { QuickPasteWorkoutSheet } from '@/features/workout/components/QuickPasteWorkoutSheet';
import type { Exercise, SetEntry, SetType, WeightUnit } from '@/lib/db/types';
import { Card, SectionTitle } from '@/components/ui/Section';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast-context';
import { EditWorkoutSheet } from './components/EditWorkoutSheet';
import { BatchWeightSheet } from './components/BatchWeightSheet';
import { DuplicateWorkoutSheet } from './components/DuplicateWorkoutSheet';
import { LoadingState } from '@/components/ui/loading-state';
import { cn } from '@/lib/utils';
import { formatPRValue } from '@/lib/domain/prFormat';
import { PRBodyNote } from '@/components/PRBodyNote';


/**
 * Μία προπόνηση, όπως τη διαβάζεις — και τη διορθώνεις — εκ των υστέρων.
 *
 * Πλήρης διαχείριση επί τόπου: επεξεργασία/επανάληψη/διαγραφή κάθε σετ,
 * προσθήκη σετ ή quick-log, προσθήκη άσκησης που ξεχάστηκε, ή επικόλληση
 * σημειώσεων, χωρίς να χρειάζεται να σβήσεις και να ξαναγράψεις την προπόνηση.
 */
export function WorkoutDetailPage() {
  const { t, i18n } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const { workoutId } = useParams<{ workoutId: string }>();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [addExerciseOpen, setAddExerciseOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pendingExercises, setPendingExercises] = useState<Exercise[]>([]);
  // «Μετακίνηση σετ σε άλλη άσκηση» — κρατά το set id όσο ο picker είναι ανοιχτός.
  const [moveSetId, setMoveSetId] = useState<string | null>(null);
  // «Αφαίρεση άσκησης» — κρατά το exercise id για το confirm dialog.
  const [removeExerciseId, setRemoveExerciseId] = useState<string | null>(null);
  // «Αλλαγή βάρους σε όλα τα σετ» της άσκησης.
  const [batchWeightExercise, setBatchWeightExercise] = useState<{ id: string; name: string } | null>(null);
  const [duplicateOpen, setDuplicateOpen] = useState(false);

  const detail = useLiveQuery(
    () => (workoutId ? getWorkoutDetail(workoutId) : Promise.resolve(null)),
    [workoutId],
    undefined,
  );
  const allExercisesQuery = useExercises();
  const allExercises = useMemo(() => allExercisesQuery ?? [], [allExercisesQuery]);
  const exerciseById = useMemo(
    () => new Map(allExercises.map((e) => [e.id, e])),
    [allExercises],
  );

  const workoutStartedAt = detail?.workout.started_at;
  const bodyweightKg = useLiveQuery(
    () => (workoutStartedAt ? getLatestBodyweight(localDay(new Date(workoutStartedAt))) : Promise.resolve(null)),
    [workoutStartedAt],
    null,
  );

  const persistedIds = useMemo(
    () => new Set(detail?.exercises.map((e) => e.exerciseId) ?? []),
    [detail?.exercises],
  );

  // Μόλις μια pending άσκηση αποκτήσει το πρώτο της σετ, περνάει στη λίστα των persisted.
  useEffect(() => {
    setPendingExercises((cur) => cur.filter((p) => !persistedIds.has(p.id)));
  }, [persistedIds]);

  if (detail === undefined) {
    return <LoadingState label={t('common.loading')} />;
  }
  if (detail === null) {
    return (
      <div className="space-y-4">
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('history.notFound')}
        </p>
      </div>
    );
  }

  const { workout, activityLabel, exercises, totalVolume, totalSets, prs } = detail;
  const started = new Date(workout.started_at);
  const excludeIds = [...persistedIds, ...pendingExercises.map((e) => e.id)];

  const onRepeat = async () => {
    const res = await startWorkoutFromCompleted(workout.id);
    if (!res) {
      showToast({ message: t('history.repeatBlocked') });
      return;
    }
    // Ο logger διαβάζει `seedExercises` από το location.state και τις
    // προγεμίζει στο νέο active session (ίδιος μηχανισμός με το Calendar).
    navigate('/workout/active', {
      state: { seedExercises: res.exerciseNames },
    });
  };

  // Σβήνει όλη την άσκηση (όλα της τα σετ) από την προπόνηση, με confirm.
  const exercisePendingRemoval = removeExerciseId
    ? exercises.find((e) => e.exerciseId === removeExerciseId)
    : null;
  const confirmRemoveExercise = async () => {
    if (!removeExerciseId) return;
    const exerciseId = removeExerciseId;
    await removeExerciseFromWorkout(workout.id, exerciseId);
    setRemoveExerciseId(null);
    showToast({
      message: t('workout.exerciseDeletedToast'),
      actionLabel: t('history.undo'),
      onAction: () => void restoreExerciseInWorkout(workout.id, exerciseId),
      durationMs: 6000,
    });
  };

  const confirmMoveSet = async (exercise: Exercise) => {
    if (!moveSetId) return;
    await moveSetToExercise(moveSetId, exercise.id);
    setMoveSetId(null);
  };

  // Μετακίνηση άσκησης πάνω/κάτω — ξαναγράφει τη σειρά μέσω created_at (βλ.
  // reorderWorkoutExercises) και το useLiveQuery ξαναδιαβάζει τη νέα σειρά.
  const moveExercise = async (exerciseId: string, dir: -1 | 1) => {
    const ids = exercises.map((e) => e.exerciseId);
    const from = ids.indexOf(exerciseId);
    const to = from + dir;
    if (from < 0 || to < 0 || to >= ids.length) return;
    const next = [...ids];
    [next[from], next[to]] = [next[to]!, next[from]!];
    await reorderWorkoutExercises(workout.id, next);
  };

  // Deduplicate PRs inside the same workout (e.g. ramping 80→90→100kg emits 3 rows;
  // show only the best achieved per exercise + PR type, and skip zero-value volume noise).
  const displayPrs = (() => {
    const best = new Map<string, (typeof prs)[number]>();
    for (const pr of prs) {
      if (pr.value <= 0) continue;
      const key = `${pr.exercise_id ?? pr.activity_kind ?? ''}:${pr.type}`;
      const cur = best.get(key);
      const isBetter =
        !cur ||
        (pr.type === 'fastest_pace' ? pr.value < cur.value : pr.value > cur.value);
      if (isBetter) best.set(key, pr);
    }
    return [...best.values()];
  })();

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {workout.workout_type ?? activityLabel}
          </h1>
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={() => void onRepeat()}
              aria-label={t('history.repeatWorkout')}
              title={t('history.repeatWorkout')}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Repeat className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDuplicateOpen(true)}
              aria-label={t('history.duplicateWorkout')}
              title={t('history.duplicateWorkout')}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Copy className="h-4 w-4" />
            </button>
            <button
              onClick={() => setEditOpen(true)}
              aria-label={t('history.editWorkout')}
              className="flex h-11 w-11 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Pencil className="h-4 w-4" />
            </button>
          </div>
        </div>
        <p className="-mt-1 text-sm text-muted-foreground">
          {started.toLocaleDateString(i18n.resolvedLanguage, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t('history.totalSets')} value={String(totalSets)} />
        <Stat
          label={t('history.volume')}
          value={totalVolume > 0 ? `${toDisplayWeight(totalVolume, unit, 'plate')}` : '—'}
          unit={totalVolume > 0 ? unit : undefined}
        />
        <Stat
          label={t('workout.duration')}
          value={workout.duration_seconds ? formatHMS(workout.duration_seconds) : '—'}
        />
      </div>

      {displayPrs.length > 0 && (
        <Card className="border border-gold/40">
          <SectionTitle>{t('workout.prs')}</SectionTitle>
          <ul className="space-y-1.5">
            {displayPrs.map((pr) => {
              const exName = pr.exercise_id ? exerciseById.get(pr.exercise_id)?.name : null;
              return (
                <li key={pr.id} className="flex items-center gap-2 text-sm">
                  <Trophy className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {exName ? <span className="font-medium">{exName}</span> : null}
                    {exName ? ' · ' : null}
                    <span className={exName ? 'text-xs text-muted-foreground' : undefined}>
                      {t(`history.pr.${pr.type}`)}
                    </span>
                    <PRBodyNote pr={pr} unit={unit} />
                  </span>
                  <span className="shrink-0 font-mono tabular-nums text-gold-strong">
                    {formatPRValue(pr, unit)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {exercises.length === 0 && pendingExercises.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('workout.noExercises')}
        </p>
      ) : (
        <div className="space-y-3">
          {exercises.map((ex, idx) => {
            const fullEx = exerciseById.get(ex.exerciseId);
            return (
              <HistoryExerciseCard
                key={ex.exerciseId}
                workoutId={workout.id}
                exerciseId={ex.exerciseId}
                name={ex.name}
                exercise={fullEx}
                sets={ex.sets}
                volume={ex.volume}
                unit={unit}
                bodyweightKg={bodyweightKg}
                onMoveSet={(setId) => setMoveSetId(setId)}
                onRemoveExercise={() => setRemoveExerciseId(ex.exerciseId)}
                onBatchWeight={() => setBatchWeightExercise({ id: ex.exerciseId, name: ex.name })}
                canMoveUp={idx > 0}
                canMoveDown={idx < exercises.length - 1}
                onMoveExercise={(dir) => void moveExercise(ex.exerciseId, dir)}
              />
            );
          })}
          {pendingExercises.map((ex) => (
            <HistoryExerciseCard
              key={ex.id}
              workoutId={workout.id}
              exerciseId={ex.id}
              name={ex.name}
              exercise={ex}
              sets={[]}
              volume={0}
              unit={unit}
              bodyweightKg={bodyweightKg}
              defaultAdding
              onRemovePending={() =>
                setPendingExercises((cur) => cur.filter((p) => p.id !== ex.id))
              }
            />
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setAddExerciseOpen(true)}
        >
          <Plus className="h-4 w-4" />
          {t('history.addExercise')}
        </Button>
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setPasteOpen(true)}
          aria-label={t('workout.pasteNotes')}
        >
          <ClipboardPaste className="h-4 w-4" />
          <span>{t('workout.pasteNotes')}</span>
        </Button>
      </div>

      {workout.notes && (
        <Card>
          <SectionTitle>{t('workout.notes')}</SectionTitle>
          <p className="whitespace-pre-wrap text-sm">{workout.notes}</p>
        </Card>
      )}

      <EditWorkoutSheet open={editOpen} onClose={() => setEditOpen(false)} workout={workout} />

      <AddExerciseSheet
        open={addExerciseOpen}
        onClose={() => setAddExerciseOpen(false)}
        excludeIds={excludeIds}
        onPick={(ex) => {
          if (!excludeIds.includes(ex.id)) {
            setPendingExercises((cur) => [...cur, ex]);
          }
        }}
      />

      <QuickPasteWorkoutSheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        workoutId={workout.id}
      />

      <ConfirmDialog
        open={exercisePendingRemoval != null}
        title={t('workout.removeExerciseConfirmTitle')}
        description={
          exercisePendingRemoval
            ? `${exercisePendingRemoval.name} · ${t('workout.removeExerciseConfirmDesc')}`
            : t('workout.removeExerciseConfirmDesc')
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void confirmRemoveExercise()}
        onCancel={() => setRemoveExerciseId(null)}
      />

      <AddExerciseSheet
        open={moveSetId != null}
        onClose={() => setMoveSetId(null)}
        title={t('workout.moveSetTitle')}
        onPick={(ex) => void confirmMoveSet(ex)}
      />

      {batchWeightExercise && (
        <BatchWeightSheet
          open={batchWeightExercise != null}
          onClose={() => setBatchWeightExercise(null)}
          workoutId={workout.id}
          exerciseId={batchWeightExercise.id}
          exerciseName={batchWeightExercise.name}
          unit={unit}
          onApplied={(count) => {
            showToast({
              message:
                count > 0
                  ? t('history.batchWeightDone', { count })
                  : t('history.batchWeightNone'),
            });
          }}
        />
      )}

      <DuplicateWorkoutSheet
        open={duplicateOpen}
        onClose={() => setDuplicateOpen(false)}
        workoutId={workout.id}
        onCopied={() => showToast({ message: t('history.duplicateDone') })}
      />
    </div>
  );
}

interface HistoryExerciseCardProps {
  workoutId: string;
  exerciseId: string;
  name: string;
  exercise: Exercise | undefined;
  sets: SetEntry[];
  volume: number;
  unit: WeightUnit;
  bodyweightKg: number | null;
  defaultAdding?: boolean;
  onRemovePending?: () => void;
  /** Μετακίνηση ενός μεμονωμένου σετ σε άλλη άσκηση. */
  onMoveSet?: (setId: string) => void;
  /** Αφαίρεση ΟΛΗΣ της άσκησης (όλα τα σετ) — ζητά confirm στον γονιό. */
  onRemoveExercise?: () => void;
  /** Αλλαγή βάρους σε όλα τα working σετ της άσκησης (batch). */
  onBatchWeight?: () => void;
  /** Αναδιάταξη ασκήσεων (πάνω/κάτω). */
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  onMoveExercise?: (dir: -1 | 1) => void;
}

function HistoryExerciseCard({
  workoutId,
  exerciseId,
  name,
  exercise,
  sets,
  volume,
  unit,
  bodyweightKg,
  defaultAdding = false,
  onRemovePending,
  onMoveSet,
  onRemoveExercise,
  onBatchWeight,
  canMoveUp = false,
  canMoveDown = false,
  onMoveExercise,
}: HistoryExerciseCardProps) {
  const { t } = useTranslation();
  const isHold = exercise?.default_unit === 'sec';
  const lastSet = sets[sets.length - 1] ?? null;
  const inferredWeighted =
    lastSet != null
      ? lastSet.weight_kg != null
      : exercise
        ? !exercise.is_bodyweight
        : true;

  const [weighted, setWeighted] = useState(inferredWeighted);
  const [adding, setAdding] = useState(defaultAdding);
  const [quickMode, setQuickMode] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [setType, setSetType] = useState<SetType>('normal');

  const quickPreview = parseQuickSets(quickText, weighted, unit);

  const onAddSet = async (
    weightKg: number | null,
    reps: number | null,
    holdSeconds: number | null,
    intensity: SetIntensity,
    restPauseReps: number[],
  ) => {
    await addSet({
      workout_id: workoutId,
      exercise_id: exerciseId,
      weight_kg: weightKg,
      bodyweight_kg: exercise?.is_bodyweight ? bodyweightKg : null,
      reps,
      rest_pause_reps: restPauseReps,
      hold_seconds: holdSeconds,
      set_type: setType,
      group_id: setType === 'dropset' || setType === 'superset' ? crypto.randomUUID() : null,
      is_warmup: setType === 'warmup',
      is_failure: setType === 'failure',
      rpe: intensity.rpe,
      rir: intensity.rir,
      tempo: intensity.tempo,
      notes: intensity.notes ?? null,
    });
    if (setType === 'dropset') setSetType('normal');
  };

  const onQuickSubmit = async () => {
    if (quickBusy || quickPreview.length === 0) return;
    setQuickBusy(true);
    try {
      const targetEx: Exercise = exercise ?? {
        id: exerciseId,
        user_id: null,
        name,
        category: 'other',
        movement_type: 'compound',
        equipment: [],
        is_weighted: weighted,
        is_bodyweight: !weighted,
        default_unit: isHold ? 'sec' : 'kg',
        notes: null,
        is_archived: false,
        created_at: '',
        updated_at: '',
        deleted_at: null,
      };
      await addQuickSets({
        workoutId,
        exercise: targetEx,
        parsed: quickPreview,
        weighted,
        bodyweightKg,
      });
      setQuickText('');
      setQuickMode(false);
      setAdding(false);
    } finally {
      setQuickBusy(false);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between gap-2 px-4 pt-3 pb-2">
        <Link
          to={`/exercises/${exerciseId}`}
          className="-mx-1 flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-0.5 tap:min-h-11 transition-colors hover:bg-muted/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{name}</span>
          {/* Στο 320px τα 4–5 icon actions (44px touch) αφήνουν ελάχιστο χώρο·
              volume + chevron συμπίεζαν το ΟΝΟΜΑ της άσκησης σε 0px. Κρύβονται
              μόνο στο κινητό — το volume φαίνεται στα stats/σετ, το link μένει. */}
          {volume > 0 && (
            <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:inline">
              {formatWeight(volume, unit, { granularity: 'plate' })}
            </span>
          )}
          <ChevronRight className="hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
        </Link>
        {onRemovePending && sets.length === 0 && (
          <button
            type="button"
            onClick={onRemovePending}
            aria-label={t('workout.removeExercise')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground tap:h-11 tap:w-11 hover:bg-accent hover:text-foreground" tap:min-h-11 tap:min-w-11
          >
            <X className="h-4 w-4" />
          </button>
        )}
        {onMoveExercise && sets.length > 0 && (
          <div className="flex shrink-0 items-center">
            <button
              type="button"
              disabled={!canMoveUp}
              onClick={() => onMoveExercise(-1)}
              aria-label={t('workout.moveUp')}
              title={t('workout.moveUp')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground tap:h-11 tap:w-11 transition-colors hover:bg-accent hover:text-foreground tap:min-h-11 tap:min-w-11 disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              disabled={!canMoveDown}
              onClick={() => onMoveExercise(1)}
              aria-label={t('workout.moveDown')}
              title={t('workout.moveDown')}
              className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground tap:h-11 tap:w-11 transition-colors hover:bg-accent hover:text-foreground tap:min-h-11 tap:min-w-11 disabled:pointer-events-none disabled:opacity-30"
            >
              <ChevronDown className="h-4 w-4" />
            </button>
          </div>
        )}
        {onRemoveExercise && sets.length > 0 && (
          <button
            type="button"
            onClick={onRemoveExercise}
            aria-label={t('workout.removeExercise')}
            title={t('workout.removeExercise')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground tap:h-11 tap:w-11 hover:bg-destructive/15 hover:text-destructive" tap:min-h-11 tap:min-w-11
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
        {onBatchWeight && sets.some((s) => s.weight_kg != null) && (
          <button
            type="button"
            onClick={onBatchWeight}
            aria-label={t('history.batchWeight')}
            title={t('history.batchWeight')}
            className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground tap:h-11 tap:w-11 hover:bg-accent hover:text-foreground" tap:min-h-11 tap:min-w-11
          >
            <SlidersHorizontal className="h-4 w-4" />
          </button>
        )}
      </div>

      {sets.length > 0 && (
        <div className="divide-y divide-border/60 border-t border-border/60">
          {sets.map((s) => (
            <SetRow
              key={s.id}
              set={s}
              weighted={s.weight_kg != null ? true : weighted}
              holdMode={isHold}
              animateCommit={false}
              onMoveToExercise={onMoveSet ? () => onMoveSet(s.id) : undefined}
            />
          ))}
        </div>
      )}

      <div className="border-t border-border/50 bg-muted/15 p-2">
        {quickMode ? (
          <div className="space-y-2 px-1">
            <div className="flex items-center gap-2">
              <Input
                autoFocus
                value={quickText}
                onChange={(e) => setQuickText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && quickPreview.length > 0) void onQuickSubmit();
                  if (e.key === 'Escape') setQuickMode(false);
                }}
                placeholder={
                  isHold
                    ? t('workout.quickPlaceholderHold')
                    : weighted
                      ? t('workout.quickPlaceholder')
                      : t('workout.quickPlaceholderBw')
                }
                className="h-9 font-mono tabular-nums"
                aria-label={t('workout.quickLog')}
              />
              <Button
                size="sm"
                className="h-9 shrink-0"
                disabled={quickPreview.length === 0 || quickBusy}
                onClick={() => void onQuickSubmit()}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 shrink-0"
                onClick={() => setQuickMode(false)}
              >
                {t('common.cancel')}
              </Button>
            </div>
            {quickPreview.length > 0 && (
              <p className="rounded-md bg-background/60 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">
                {quickPreview
                  .map((s) => {
                    const repsLabel = s.reps == null ? 'max' : isHold ? `${s.reps}s` : `${s.reps}`;
                    return s.weightKg != null
                      ? `${formatWeight(s.weightKg, unit, { withUnit: false })}×${repsLabel}`
                      : `BW×${repsLabel}`;
                  })
                  .join(' · ')}{' '}
                <span className="text-primary">({quickPreview.length} {t('workout.sets')})</span>
              </p>
            )}
          </div>
        ) : adding ? (
          <div className="space-y-2 p-1">
            {!isHold && (
              <div className="flex justify-end">
                <div role="tablist" className="flex rounded-md bg-elevated p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={!weighted}
                    onClick={() => setWeighted(false)}
                    className={cn(
                      'rounded px-2 py-0.5 transition-colors',
                      !weighted ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t('workout.bodyweight')}
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={weighted}
                    onClick={() => setWeighted(true)}
                    className={cn(
                      'rounded px-2 py-0.5 transition-colors',
                      weighted ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {t('workout.weighted')}
                  </button>
                </div>
              </div>
            )}
            <AddSetInline
              weighted={weighted}
              holdMode={isHold}
              unit={unit}
              initialWeight={lastSet?.weight_kg ?? null}
              initialReps={lastSet?.reps ?? null}
              initialHoldSeconds={lastSet?.hold_seconds ?? null}
              onSave={onAddSet}
              onCancel={() => setAdding(false)}
              setType={setType}
              onSetTypeChange={setSetType}
            />
          </div>
        ) : (
          <div className="flex gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 flex-1 justify-center text-xs text-muted-foreground hover:text-foreground tap:min-h-11"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              {t('workout.addSet')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground tap:min-h-11"
              aria-label={t('workout.quickLog')}
              onClick={() => setQuickMode(true)}
            >
              <Zap className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-center">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg leading-none tabular-nums">
        {value}
        {unit && <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
