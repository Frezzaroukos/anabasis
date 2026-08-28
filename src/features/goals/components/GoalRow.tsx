import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Pencil, Trash2 } from 'lucide-react';
import type { GoalProgress } from '@/lib/db/goals';
import type { Goal } from '@/lib/db/types';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';
import { goalTitle } from '../goalTitle';
import { GoalRing } from './GoalRing';

/**
 * Μία γραμμή στόχου. Ξεχωριστό component (όχι inline μέσα στο .map της
 * GoalsPage) για να μπορεί το useCountUp να «θυμάται» το προηγούμενο νούμερο
 * ανά στόχο — hooks μέσα σε .map callback θα έσπαγαν τη σειρά τους αν η
 * λίστα άλλαζε μήκος.
 */
export function GoalRow({
  progress,
  index,
  total,
  activityLabel,
  exerciseName,
  onMove,
  onEdit,
  onDelete,
}: {
  progress: GoalProgress;
  index: number;
  total: number;
  activityLabel: (key: string | null) => string | null;
  exerciseName: (id: string | null) => string | null;
  onMove: (index: number, delta: number) => void;
  onEdit: (goal: Goal) => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const p = progress;
  // Ολοκληρωμένος στόχος = επίτευξη → χρυσό, το ΜΟΝΟ χρώμα που δεν είναι primary.
  const completed = p.ratio >= 1;
  const decimals = Number.isInteger(p.current) ? 0 : 1;
  const displayCurrent = useCountUp(p.current, 450, decimals);

  return (
    <li className="flex items-center gap-3 rounded-lg bg-card p-4">
      <GoalRing ratio={p.ratio} completed={completed} />
      <div className="min-w-0 flex-1">
        <p className={cn('truncate text-sm font-medium', completed && 'text-gold')}>
          {p.goal.label ??
            goalTitle(t, p.goal, {
              activity: activityLabel(p.goal.activity_key),
              exercise: exerciseName(p.goal.exercise_id),
            })}
          {completed && <span className="ml-1 text-gold">★</span>}
        </p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">
          {displayCurrent} / {p.target} {p.unit}
        </p>
        {/* Κυλιόμενο παράθυρο δεν έχει προθεσμία — «μένουν 0 μέρες»
            θα ήταν ψέμα, όχι πληροφορία. */}
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          {p.daysLeft == null
            ? t('goals.noDeadline')
            : p.daysLeft > 1
              ? t('goals.daysLeft', { count: p.daysLeft })
              : t('goals.lastDay')}
        </p>
      </div>
      <div className="flex shrink-0 flex-col">
        <button
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label={t('goals.moveUp')}
          className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          aria-label={t('goals.moveDown')}
          className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <div className="flex shrink-0 flex-col">
        <button
          onClick={() => onEdit(p.goal)}
          aria-label={t('common.edit')}
          className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(p.goal.id)}
          aria-label={t('common.delete')}
          className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
