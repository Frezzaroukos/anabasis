import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { queries } from '@/lib/db';
import type { Exercise, SetEntry, SetType } from '@/lib/db/types';
import { CATEGORY_DOT, resolveSetGroup, type SetChain } from '../utils';
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

  const supportsToggle = exercise.is_bodyweight; // bodyweight exercises can be done with or without added load
  const visibleSets = sets;

  const onSave = async (weightKg: number | null, reps: number | null) => {
    const { groupId, chain: nextChain } = resolveSetGroup(setType, chain, crypto.randomUUID());
    if (nextChain !== chain) onChainChange(nextChain);
    await queries.addSet({
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
    });
    setAdding(false);
  };

  return (
    <article className="rounded-lg border border-border bg-card">
      <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', CATEGORY_DOT[exercise.category])}
            aria-hidden
          />
          <span className="truncate text-sm font-medium">{exercise.name}</span>
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
        {adding ? (
          <AddSetInline
            weighted={weighted}
            onSave={onSave}
            onCancel={() => setAdding(false)}
            setType={setType}
            onSetTypeChange={setSetType}
          />
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-center"
            onClick={() => setAdding(true)}
          >
            <Plus className="h-4 w-4" />
            {t('workout.addSet')}
          </Button>
        )}
      </div>
    </article>
  );
}
