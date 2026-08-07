import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { queries } from '@/lib/db';
import { getLastPerformance } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { Exercise, SetEntry, SetType } from '@/lib/db/types';
import { CATEGORY_DOT, resolveSetGroup, type SetChain } from '../utils';
import { parseQuickSets } from '../quickLog';
import type { SetIntensity } from './AddSetInline';
import { SetRow } from './SetRow';
import { AddSetInline } from './AddSetInline';

interface ExerciseCardProps {
  exercise: Exercise;
  workoutId: string;
  sets: SetEntry[];
  weighted: boolean;
  onWeightedChange: (next: boolean) => void;
  chain: SetChain | null;
  onChainChange: (next: SetChain | null) => void;
}

export function ExerciseCard({
  exercise,
  workoutId,
  sets,
  weighted,
  onWeightedChange,
  chain,
  onChainChange,
}: ExerciseCardProps) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(sets.length === 0);
  const [setType, setSetType] = useState<SetType>('normal');
  const [quickMode, setQuickMode] = useState(false);
  const [quickText, setQuickText] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  // Πόσα ρεκόρ έσπασε το πιο πρόσφατο σετ — για τη γιορτή (χρυσό pulse).
  const [prCount, setPrCount] = useState(0);

  const celebrate = (n: number) => {
    if (n <= 0) return;
    setPrCount(n);
    // Η γιορτή σβήνει μόνη της· δεν μπλοκάρει την επόμενη καταγραφή.
    globalThis.setTimeout(() => setPrCount(0), 2600);
  };

  const supportsToggle = exercise.is_bodyweight; // bodyweight exercises can be done with or without added load
  const visibleSets = sets;

  // «Τι έκανα την τελευταία φορά» — προ-γεμίζει τα inputs ώστε το τυπικό
  // «ίδιο βάρος με πέρσι» να μη θέλει καθόλου πληκτρολόγηση.
  const last = useLiveQuery(() => getLastPerformance(exercise.id), [exercise.id]);

  const onSave = async (
    weightKg: number | null,
    reps: number | null,
    intensity: SetIntensity,
  ) => {
    const { groupId, chain: nextChain } = resolveSetGroup(setType, chain, crypto.randomUUID());
    if (nextChain !== chain) onChainChange(nextChain);
    const res = await queries.addSet({
      workout_id: workoutId,
      exercise_id: exercise.id,
      weight_kg: weightKg,
      bodyweight_kg: null,
      reps,
      hold_seconds: null,
      set_type: setType,
      group_id: groupId,
      is_warmup: setType === 'warmup',
      is_failure: setType === 'failure',
      rpe: intensity.rpe,
      rir: intensity.rir,
      tempo: intensity.tempo,
    });
    celebrate(res.newPRs.length);
    setAdding(false);
  };

  /**
   * Γρήγορη καταγραφή ολόκληρης άσκησης σε μία γραμμή («80 5,4,3,2»), όπως
   * γράφει ο χρήστης στο σημειωματάριό του — αντί για tap ανά σετ. Το
   * quick-log ΔΕΝ μπλέκει με αλυσίδες: όλα μπαίνουν ως κανονικά σετ.
   */
  const onQuickSubmit = async () => {
    if (quickBusy) return;
    const parsed = parseQuickSets(quickText, weighted);
    if (parsed.length === 0) return;
    setQuickBusy(true);
    try {
      let prs = 0;
      for (const s of parsed) {
        const res = await queries.addSet({
          workout_id: workoutId,
          exercise_id: exercise.id,
          weight_kg: weighted ? s.weightKg : null,
          bodyweight_kg: null,
          reps: s.reps,
          hold_seconds: null,
        });
        prs += res.newPRs.length;
      }
      celebrate(prs);
      setQuickText('');
      setQuickMode(false);
      setAdding(false);
    } finally {
      setQuickBusy(false);
    }
  };

  const quickPreview = parseQuickSets(quickText, weighted);

  return (
    <article
      className={cn(
        'rounded-lg border bg-card transition-colors',
        prCount > 0 ? 'border-gold' : 'border-border',
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', CATEGORY_DOT[exercise.category])}
            aria-hidden
          />
          <span className="truncate text-sm font-medium">{exercise.name}</span>
          {/* Γιορτή ρεκόρ: χρυσό, πάλλεται μία φορά. Λειτουργικό (σε ενημερώνει
              ότι ξεπέρασες τον εαυτό σου) + ζωντανό — όχι διακόσμηση. */}
          {prCount > 0 && (
            <span
              className="animate-pr-pulse flex shrink-0 items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[11px] font-semibold text-gold"
              role="status"
            >
              🏆 {prCount > 1 ? `${prCount} ${t('workout.prs')}` : t('workout.pr')}
            </span>
          )}
        </div>

        {supportsToggle && (
          <div
            role="tablist"
            className="flex shrink-0 rounded-md border border-border p-0.5 text-[11px] font-medium"
          >
            <button
              type="button"
              role="tab"
              aria-selected={!weighted}
              onClick={() => onWeightedChange(false)}
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
              onClick={() => onWeightedChange(true)}
              className={cn(
                'rounded px-2 py-0.5 transition-colors',
                weighted ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
              )}
            >
              {t('workout.weighted')}
            </button>
          </div>
        )}
      </header>

      <div className="divide-y divide-border">
        {visibleSets.length === 0 ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">{t('workout.swipeHint')}</p>
        ) : (
          visibleSets.map((s) => <SetRow key={s.id} set={s} weighted={weighted} />)
        )}
      </div>

      <div className="border-t border-border p-2">
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
                placeholder={weighted ? t('workout.quickPlaceholder') : t('workout.quickPlaceholderBw')}
                className="h-9 font-mono"
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
            {/* Ζωντανή προεπισκόπηση: ο χρήστης βλέπει τι θα καταγραφεί καθώς γράφει */}
            {quickPreview.length > 0 && (
              <p className="px-1 font-mono text-[11px] text-muted-foreground">
                {quickPreview
                  .map((s) => (s.weightKg != null ? `${s.weightKg}×${s.reps}` : `${s.reps}`))
                  .join('  ·  ')}{' '}
                <span className="text-primary">({quickPreview.length} {t('workout.sets')})</span>
              </p>
            )}
          </div>
        ) : adding ? (
          <>
            <AddSetInline
              weighted={weighted}
              initialWeight={last?.weight_kg ?? null}
              initialReps={last?.reps ?? null}
              lastLabel={
                last && (last.weight_kg != null || last.reps != null)
                  ? `${t('workout.previous')}: ${
                      last.weight_kg != null ? `${last.weight_kg}kg` : t('workout.bodyweight')
                    }${last.reps != null ? ` × ${last.reps}` : ''}`
                  : null
              }
              onSave={onSave}
              onCancel={() => setAdding(false)}
              setType={setType}
              onSetTypeChange={setSetType}
            />
            <button
              type="button"
              onClick={() => setQuickMode(true)}
              className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
            >
              <Zap className="h-3 w-3" />
              {t('workout.quickLog')}
            </button>
          </>
        ) : (
          <div className="flex gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="flex-1 justify-center"
              onClick={() => setAdding(true)}
            >
              <Plus className="h-4 w-4" />
              {t('workout.addSet')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              aria-label={t('workout.quickLog')}
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
