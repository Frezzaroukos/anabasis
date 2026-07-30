import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { SetType } from '@/lib/db/types';

/** Σειρά εμφάνισης των τύπων σετ στον επιλογέα. */
const SET_TYPES: SetType[] = [
  'normal',
  'warmup',
  'dropset',
  'superset',
  'rest_pause',
  'amrap',
  'failure',
];

interface AddSetInlineProps {
  weighted: boolean;
  initialWeight?: number | null;
  initialReps?: number | null;
  onSave: (weightKg: number | null, reps: number | null) => Promise<void> | void;
  onCancel?: () => void;
  saveLabelKey?: 'workout.addSet' | 'workout.save';
  /** Όταν δίνεται, εμφανίζεται ο επιλογέας τύπου σετ (μόνο κατά την προσθήκη — όχι στο edit). */
  setType?: SetType;
  onSetTypeChange?: (type: SetType) => void;
}

export function AddSetInline({
  weighted,
  initialWeight,
  initialReps,
  onSave,
  onCancel,
  saveLabelKey = 'workout.addSet',
  setType,
  onSetTypeChange,
}: AddSetInlineProps) {
  const { t } = useTranslation();
  const [weight, setWeight] = useState<string>(
    initialWeight != null ? String(initialWeight) : '',
  );
  const [reps, setReps] = useState<string>(
    initialReps != null ? String(initialReps) : '',
  );
  const [busy, setBusy] = useState(false);

  const repsNum = reps.trim() === '' ? null : Number(reps);
  const weightNum = weight.trim() === '' ? null : Number(weight);
  const repsValid = repsNum != null && Number.isFinite(repsNum) && repsNum > 0;
  const weightValid =
    !weighted || (weightNum != null && Number.isFinite(weightNum) && weightNum >= 0);
  const valid = repsValid && weightValid;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSave(weighted ? weightNum : null, repsNum);
      setWeight('');
      setReps('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {onSetTypeChange && (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('workout.setType')}>
          {SET_TYPES.map((st) => (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={setType === st}
              onClick={() => onSetTypeChange(st)}
              className={cn(
                'rounded-full border border-border px-2.5 py-1 text-[11px] font-medium transition-colors',
                setType === st
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {t(`setType.${st}`)}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        {weighted && (
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('workout.weightKg')}
            </span>
            <Input
              inputMode="decimal"
              type="number"
              step="0.5"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-9"
              aria-label={t('workout.weightKg')}
            />
          </label>
        )}
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('workout.reps')}
          </span>
          <Input
            inputMode="numeric"
            type="number"
            min="1"
            step="1"
            value={reps}
            onChange={(e) => setReps(e.target.value)}
            className="h-9"
            aria-label={t('workout.reps')}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && valid) void submit();
            }}
          />
        </label>
        <Button
          size="sm"
          disabled={!valid || busy}
          onClick={() => void submit()}
          className="h-9 shrink-0"
        >
          {t(saveLabelKey)}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-9 shrink-0">
            {t('common.cancel')}
          </Button>
        )}
      </div>
    </div>
  );
}
