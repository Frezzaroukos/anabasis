import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trash2, Unlink } from 'lucide-react';
import { updateProgramExercise } from '@/lib/db/queries';
import type { Exercise, ProgramExercise, SetType } from '@/lib/db/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { parseWeightToKg, toDisplayWeight } from '@/lib/units';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

const SET_TYPES: SetType[] = [
  'normal',
  'warmup',
  'dropset',
  'superset',
  'rest_pause',
  'amrap',
  'failure',
];

interface ProgramExerciseRowProps {
  item: ProgramExercise;
  exercise: Exercise;
  /** Δείχνει το κουμπί «αποσύνδεση από την αλυσίδα» — μόνο για γραμμές μέσα σε group. */
  showUnlink: boolean;
  onUnlink: () => void;
  onDelete: () => void;
}

/**
 * Μία επεξεργάσιμη γραμμή στόχου. Δουλεύει πάντα μέσω updateProgramExercise
 * — τα components ΔΕΝ αγγίζουν το db απευθείας. Τα αριθμητικά committάρονται
 * onBlur (όχι σε κάθε keystroke) για να μη γράφουμε στη Dexie συνέχεια.
 */
export function ProgramExerciseRow({
  item,
  exercise,
  showUnlink,
  onUnlink,
  onDelete,
}: ProgramExerciseRowProps) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const [sets, setSets] = useState(item.target_sets != null ? String(item.target_sets) : '');
  const [reps, setReps] = useState(item.target_reps != null ? String(item.target_reps) : '');
  const [weight, setWeight] = useState(
    item.target_weight_kg != null ? String(toDisplayWeight(item.target_weight_kg, unit)) : '',
  );
  const [hold, setHold] = useState(
    item.target_hold_seconds != null ? String(item.target_hold_seconds) : '',
  );
  const [notes, setNotes] = useState(item.notes ?? '');

  const showHold = exercise.default_unit === 'sec';
  const showWeight = exercise.is_weighted || exercise.is_bodyweight;

  const commitInt = (raw: string, field: 'target_sets' | 'target_reps' | 'target_hold_seconds') => {
    const trimmed = raw.trim();
    const n = trimmed === '' ? null : Math.round(Number(trimmed));
    void updateProgramExercise(item.id, { [field]: n != null && Number.isFinite(n) ? n : null });
  };
  const commitWeight = (raw: string) => {
    const trimmed = raw.trim();
    const n = trimmed === '' ? null : Number(trimmed);
    void updateProgramExercise(item.id, {
      target_weight_kg: n != null && Number.isFinite(n) ? parseWeightToKg(n, unit) : null,
    });
  };
  const commitNotes = (raw: string) => {
    void updateProgramExercise(item.id, { notes: raw.trim() === '' ? null : raw });
  };

  return (
    <div className="space-y-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{exercise.name}</p>
        <div className="flex shrink-0 items-center gap-1">
          {showUnlink && (
            <button
              type="button"
              onClick={onUnlink}
              aria-label={t('programs.unlink')}
              className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Unlink className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            aria-label={t('common.delete')}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {t('programs.targetSets')}
          </span>
          <Input
            inputMode="numeric"
            type="number"
            min="1"
            step="1"
            value={sets}
            onChange={(e) => setSets(e.target.value)}
            onBlur={() => commitInt(sets, 'target_sets')}
            className="h-9 font-mono"
            aria-label={t('programs.targetSets')}
          />
        </label>

        {showHold ? (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('programs.targetHold')}
            </span>
            <Input
              inputMode="numeric"
              type="number"
              min="0"
              step="1"
              value={hold}
              onChange={(e) => setHold(e.target.value)}
              onBlur={() => commitInt(hold, 'target_hold_seconds')}
              className="h-9 font-mono"
              aria-label={t('programs.targetHold')}
            />
          </label>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('programs.targetReps')}
            </span>
            <Input
              inputMode="numeric"
              type="number"
              min="0"
              step="1"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              onBlur={() => commitInt(reps, 'target_reps')}
              className="h-9 font-mono"
              aria-label={t('programs.targetReps')}
            />
          </label>
        )}

        {showWeight ? (
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('common.weight')} ({t(`common.${unit}`)})
            </span>
            <Input
              inputMode="decimal"
              type="number"
              min="0"
              step="0.5"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              onBlur={() => commitWeight(weight)}
              className="h-9 font-mono"
              aria-label={`${t('common.weight')} (${t(`common.${unit}`)})`}
            />
          </label>
        ) : (
          <div />
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SET_TYPES.map((st) => (
          <button
            key={st}
            type="button"
            onClick={() => void updateProgramExercise(item.id, { set_type: st })}
            className={cn(
              'rounded-md px-2 py-1 text-[11px] transition-colors',
              item.set_type === st
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
            )}
          >
            {t(`setType.${st}`)}
          </button>
        ))}
      </div>

      <Input
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        onBlur={() => commitNotes(notes)}
        placeholder={t('programs.notesPlaceholder')}
        className="h-9 text-xs"
        aria-label={t('programs.notes')}
      />
    </div>
  );
}
