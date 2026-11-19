import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Compass, Copy, HelpCircle, Plus, TrendingDown, Weight, X, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { queries } from '@/lib/db';
import { getLastPerformance } from '@/lib/db/queries';
import { addQuickSets, duplicateSet } from '@/lib/db/workoutHelpers';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight } from '@/lib/units';
import { buildLastPerformance, suggestNextForExercise } from '@/lib/domain/coach';
import { formatMove } from '@/features/coach/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Exercise, ProgramExercise, SetEntry, SetType } from '@/lib/db/types';
import { CATEGORY_DOT, resolveSetGroup, type SetChain } from '../utils';
import { parseQuickSets } from '../quickLog';
import type { SetIntensity } from './AddSetInline';
import { SetRow } from './SetRow';
import { AddSetInline } from './AddSetInline';
import { RungCelebration } from './RungCelebration';

interface ExerciseCardProps {
  exercise: Exercise;
  workoutId: string;
  sets: SetEntry[];
  /** Σωματικό βάρος τη μέρα του workout (snapshot) — φορτίο = bw + πρόσθετο. */
  bodyweightKg: number | null;
  weighted: boolean;
  onWeightedChange: (next: boolean) => void;
  chain: SetChain | null;
  onChainChange: (next: SetChain | null) => void;
  /** Η γραμμή του προγράμματος για αυτή την άσκηση — `null` εκτός πλάνου. */
  target?: ProgramExercise | null;
  /** Ξεκίνα κλειστή παρόλο που δεν έχει σετ (άσκηση πλάνου, όχι δική σου επιλογή τώρα). */
  startCollapsed?: boolean;
  onNeedBodyweight?: () => void;
  /** Επιτρέπει αφαίρεση άδειας άσκησης (0 σετ) από την τρέχουσα προπόνηση. */
  onRemove?: () => void;
}

export function ExerciseCard({
  exercise,
  workoutId,
  sets,
  bodyweightKg,
  weighted,
  onWeightedChange,
  chain,
  onChainChange,
  target = null,
  startCollapsed = false,
  onNeedBodyweight,
  onRemove,
}: ExerciseCardProps) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const [adding, setAdding] = useState(sets.length === 0 && !startCollapsed);
  const [setType, setSetType] = useState<SetType>('normal');
  const [quickMode, setQuickMode] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const [repeatBusy, setRepeatBusy] = useState(false);
  const [showQuickHelp, setShowQuickHelp] = useState(false);
  // Πόσα ρεκόρ έσπασε το πιο πρόσφατο σετ — για τη γιορτή (χρυσό pulse).
  const [prCount, setPrCount] = useState(0);

  /**
   * «3 × 8 · 60 kg» — μόνο ό,τι ορίζει πραγματικά το πρόγραμμα. Κενά πεδία
   * παραλείπονται αντί να γίνουν «0», που θα ήταν ψεύτικος στόχος.
   */
  const targetLabel = (() => {
    if (!target) return null;
    const reps =
      target.target_sets != null && target.target_reps != null
        ? `${target.target_sets} × ${target.target_reps}`
        : target.target_sets != null
          ? `${target.target_sets} × ${t('workout.sets')}`
          : null;
    const hold =
      target.target_hold_seconds != null ? `${target.target_hold_seconds}${t('common.sec')}` : null;
    const load =
      target.target_weight_kg != null
        ? formatWeight(target.target_weight_kg, unit, { withUnit: true })
        : null;
    const parts = [reps ?? hold, load].filter(Boolean);
    return parts.length > 0 ? parts.join(' · ') : null;
  })();

  const celebrate = (n: number) => {
    if (n <= 0) return;
    setPrCount(n);
    // Η γιορτή σβήνει μόνη της· δεν μπλοκάρει την επόμενη καταγραφή.
    globalThis.setTimeout(() => setPrCount(0), 2600);
  };

  const isHold = exercise.default_unit === 'sec'; // skill/isometric άσκηση — reps γίνεται hold σε δευτερόλεπτα
  // Οποιαδήποτε μη-hold άσκηση επιτρέπει BW ↔ Weighted toggle, ώστε μια custom
  // άσκηση (π.χ. Muscle Up) να μη σε κλειδώνει ποτέ σε υποχρεωτικά κιλά.
  const supportsToggle = !isHold;
  const visibleSets = sets;
  const latestSet = visibleSets[visibleSets.length - 1] ?? null;
  const setBodyweight = exercise.is_bodyweight ? bodyweightKg : null;
  const needsBodyweight = exercise.is_bodyweight && bodyweightKg == null;

  // «Τι έκανα την τελευταία φορά» — προ-γεμίζει τα inputs ώστε το τυπικό
  // «ίδιο βάρος με πέρσι» να μη θέλει καθόλου πληκτρολόγηση.
  const last = useLiveQuery(
    () => getLastPerformance(exercise.id, { excludeWorkoutId: workoutId }),
    [exercise.id, workoutId],
  );

  // Coach hint: ίδιος κανόνας double-progression με το Next Moves panel
  // (coach.ts), localized. Κενό όταν coach OFF ή χωρίς ιστορικό (no invented data).
  const coachMove =
    settings?.coach_enabled && last
      ? suggestNextForExercise(
          buildLastPerformance({
            id: exercise.id,
            exerciseId: exercise.id,
            exerciseName: exercise.name,
            isBodyweight: exercise.is_bodyweight,
            isHold,
            reps: last.reps,
            weightKg: last.weight_kg,
            holdSeconds: last.hold_seconds,
          }),
        )
      : null;
  const coachHint = coachMove
    ? formatMove(coachMove, t, (kg) => formatWeight(kg, unit, { withUnit: true }))
    : null;

  const onSave = async (
    weightKg: number | null,
    reps: number | null,
    holdSeconds: number | null,
    intensity: SetIntensity,
    restPauseReps: number[],
  ) => {
    const { groupId, chain: nextChain } = resolveSetGroup(setType, chain, crypto.randomUUID());
    if (nextChain !== chain) onChainChange(nextChain);
    const res = await queries.addSet({
      workout_id: workoutId,
      exercise_id: exercise.id,
      weight_kg: weightKg,
      bodyweight_kg: setBodyweight,
      reps,
      rest_pause_reps: restPauseReps,
      hold_seconds: holdSeconds,
      set_type: setType,
      group_id: groupId,
      is_warmup: setType === 'warmup',
      is_failure: setType === 'failure',
      rpe: intensity.rpe,
      rir: intensity.rir,
      tempo: intensity.tempo,
      notes: intensity.notes ?? null,
    });
    celebrate(res.newPRs.length);
    // Αν μόλις καταχωρίσαμε drop set, επιστρέφουμε το selector σε normal για το επόμενο κανονικό σετ.
    if (setType === 'dropset') setSetType('normal');
  };

  /** 1-tap αντιγραφή του τελευταίου σετ της άσκησης. */
  const onRepeatLast = async () => {
    if (!latestSet || repeatBusy) return;
    setRepeatBusy(true);
    try {
      const res = await duplicateSet(latestSet);
      celebrate(res.newPRs.length);
    } finally {
      setRepeatBusy(false);
    }
  };

  /** 1-tap έναρξη drop set: συνδέει το τελευταίο σετ αν δεν έχει ήδη group_id και ανοίγει τη φόρμα. */
  const onStartDropSet = async () => {
    if (latestSet) {
      const groupId = latestSet.group_id ?? crypto.randomUUID();
      if (!latestSet.group_id) {
        await queries.updateSet(latestSet.id, { group_id: groupId });
      }
      onChainChange({ id: groupId, type: 'dropset' });
    }
    onWeightedChange(true);
    setSetType('dropset');
    setQuickMode(false);
    setAdding(true);
  };

  /**
   * Γρήγορη καταγραφή ολόκληρης άσκησης σε μία γραμμή («30kg 5+4+3(drop set 10kg 7)»,
   * «80kg 1 + 90kg 1 + 100kg 1», «18kg 4xmax», «26kg 2,5+1»).
   */
  const onQuickSubmit = async () => {
    if (quickBusy) return;
    const parsed = parseQuickSets(quickText, weighted, unit);
    if (parsed.length === 0) return;
    setQuickBusy(true);
    try {
      const res = await addQuickSets({
        workoutId,
        exercise,
        parsed,
        weighted,
        bodyweightKg,
      });
      celebrate(res.newPRs.length);
      setQuickText('');
      setQuickMode(false);
      setAdding(false);
    } finally {
      setQuickBusy(false);
    }
  };

  const quickPreview = parseQuickSets(quickText, weighted, unit);

  return (
    <article
      className={cn(
        'relative rounded-lg transition-colors',
        adding || quickMode ? 'bg-elevated' : 'bg-card',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', CATEGORY_DOT[exercise.category])}
            aria-hidden
          />
          <span className="min-w-0 truncate text-sm font-medium">{exercise.name}</span>
          {targetLabel && (
            <span className="shrink-0 rounded-full bg-elevated px-2 py-0.5 font-mono text-xs tabular-nums text-muted-foreground">
              {targetLabel}
            </span>
          )}
          {coachHint && <CoachProgressionHint hint={coachHint} />}
          {prCount > 0 && (
            <span
              className="flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-xs font-semibold text-gold"
              role="status"
            >
              🏆 {prCount > 1 ? `${prCount} ${t('workout.prs')}` : t('workout.pr')}
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {supportsToggle && (
            <div
              role="tablist"
              className="flex shrink-0 rounded-md bg-elevated p-0.5 text-xs font-medium"
            >
              <button
                type="button"
                role="tab"
                aria-selected={!weighted}
                onClick={() => onWeightedChange(false)}
                className={cn(
                  'rounded px-2 py-0.5 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                  !weighted ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('workout.bodyweight')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={weighted}
                onClick={() => onWeightedChange(true)}
                className={cn(
                  'rounded px-2 py-0.5 transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring',
                  weighted ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('workout.weighted')}
              </button>
            </div>
          )}
          {onRemove && visibleSets.length === 0 && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={t('workout.removeExercise')}
              title={t('workout.removeExercise')}
              className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </header>

      <RungCelebration active={prCount > 0} className="absolute -right-1 -top-1 z-10 h-11 w-11" />

      {needsBodyweight && (
        <button
          type="button"
          onClick={onNeedBodyweight}
          className="flex w-full items-center gap-1.5 border-t border-border/60 px-3 py-1.5 text-left text-xs text-muted-foreground hover:text-primary"
        >
          <Weight className="h-3 w-3 shrink-0" aria-hidden />
          {t('workout.setBodyweightHint')}
        </button>
      )}

      {visibleSets.length > 0 && (
        <div className="divide-y divide-border/60 border-t border-border/60">
          {visibleSets.map((s) => (
            <SetRow
              key={s.id}
              set={s}
              weighted={weighted}
              holdMode={isHold}
              onDuplicated={celebrate}
            />
          ))}
        </div>
      )}

      <div className="border-t border-border/40 p-2">
        {quickMode ? (
          <div className="space-y-2">
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
              <button
                type="button"
                onClick={() => setShowQuickHelp(!showQuickHelp)}
                className="flex shrink-0 items-center justify-center text-muted-foreground hover:text-primary"
                aria-label={t('workout.quickLog')}
              >
                <HelpCircle className="h-5 w-5" />
              </button>
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
            {showQuickHelp && (
              <div className="space-y-0.5 rounded-md bg-muted/40 px-2 py-1.5 text-xs text-muted-foreground">
                <p>{t('workout.quickLogFormatRich')}</p>
              </div>
            )}
            {quickPreview.length > 0 && (
              <p className="rounded-md bg-background/60 px-2 py-1 font-mono text-xs tabular-nums text-muted-foreground">
                {quickPreview
                  .map((s) => {
                    const repsLabel =
                      s.reps == null
                        ? 'max'
                        : isHold
                          ? `${s.reps}s`
                          : `${s.reps}`;
                    const base =
                      s.weightKg != null
                        ? `${formatWeight(s.weightKg, unit, { withUnit: false })}×${repsLabel}`
                        : `BW×${repsLabel}`;
                    const tag =
                      s.setType === 'dropset'
                        ? ' ↓'
                        : s.setType === 'amrap'
                          ? ' AMRAP'
                          : '';
                    return `${base}${tag}`;
                  })
                  .join('  ·  ')}{' '}
                <span className="text-primary">({quickPreview.length} {t('workout.sets')})</span>
              </p>
            )}
          </div>
        ) : adding ? (
          <>
            <AddSetInline
              weighted={weighted}
              holdMode={isHold}
              unit={unit}
              initialWeight={latestSet?.weight_kg ?? last?.weight_kg ?? null}
              initialReps={last?.reps ?? null}
              initialHoldSeconds={last?.hold_seconds ?? null}
              lastLabel={
                last && (last.weight_kg != null || last.reps != null || last.hold_seconds != null)
                  ? `${t('workout.previous')}: ${
                      last.weight_kg != null ? formatWeight(last.weight_kg, unit) : t('workout.bodyweight')
                    }${last.reps != null ? ` × ${last.reps}` : ''}${
                      last.hold_seconds != null ? ` · ${last.hold_seconds}s` : ''
                    }`
                  : null
              }
              onSave={onSave}
              onCancel={() => setAdding(false)}
              setType={setType}
              onSetTypeChange={setSetType}
            />
            <div className="mt-2 flex items-center justify-center gap-4">
              <button
                type="button"
                onClick={() => setQuickMode(true)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              >
                <Zap className="h-3 w-3" />
                {t('workout.quickLog')}
              </button>
              {latestSet && !isHold && (
                <button
                  type="button"
                  disabled={repeatBusy}
                  onClick={() => void onRepeatLast()}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                >
                  <Copy className="h-3 w-3" />
                  {t('workout.repeatLastSet')}
                </button>
              )}
              {latestSet && !isHold && (
                <button
                  type="button"
                  onClick={() => void onStartDropSet()}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                >
                  <TrendingDown className="h-3 w-3" />
                  {t('workout.addDropSet')}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-center"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-4 w-4" />
              {t('workout.addSet')}
            </Button>
            {latestSet && (
              <Button
                variant="ghost"
                size="sm"
                disabled={repeatBusy}
                onClick={() => void onRepeatLast()}
                title={t('workout.duplicateSet')}
              >
                <Copy className="h-3.5 w-3.5" />
                {t('workout.repeatLastSet')}
              </Button>
            )}
            {latestSet && !isHold && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onStartDropSet()}
                title={t('workout.addDropSet')}
              >
                <TrendingDown className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{t('workout.addDropSet')}</span>
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('workout.quickLog')}
              title={t('workout.quickLog')}
              onClick={() => setQuickMode(true)}
            >
              <Zap className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

/**
 * Coach mode progression hint — non-intrusive chip με την επόμενη κίνηση.
 */
function CoachProgressionHint({ hint }: { hint: string }) {
  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">
      <Compass className="h-3 w-3" />
      <span className="font-medium">{hint}</span>
    </span>
  );
}
