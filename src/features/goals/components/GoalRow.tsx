import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronUp, CircleCheck, LineChart, Pencil, Trash2 } from 'lucide-react';
import type { GoalProgress } from '@/lib/db/goals';
import type { Goal } from '@/lib/db/types';
import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';
import { goalTitle } from '../goalTitle';
import { GoalProgramLink } from './GoalProgramLink';
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

  // «Μόλις έγινε» pulse — ξεχωρίζει τη ΣΤΙΓΜΗ της επίτευξης από το μόνιμο
  // χρυσό state που ακολουθεί. Χωρίς αυτό ο στόχος περνάει σε completed
  // αθόρυβα, ίδιο dead feeling με ό,τι ζητήθηκε να διορθωθεί.
  const wasCompletedRef = useRef(completed);
  const [justCompleted, setJustCompleted] = useState(false);
  useEffect(() => {
    if (completed && !wasCompletedRef.current) {
      setJustCompleted(true);
      const timer = setTimeout(() => setJustCompleted(false), 600);
      wasCompletedRef.current = completed;
      return () => clearTimeout(timer);
    }
    wasCompletedRef.current = completed;
  }, [completed]);

  const isFrequencyGoal = p.goal.metric === 'sessions' && p.goal.period === 'week';

  return (
    <li
      className={cn(
        'flex items-center gap-3 rounded-xl bg-card p-4 transition-colors',
        completed && 'ring-1 ring-gold/25',
      )}
    >
      <GoalRing ratio={p.ratio} completed={completed} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className={cn('min-w-0 flex-1 truncate text-sm font-medium', completed && 'text-gold')}>
            {p.goal.label ??
              goalTitle(t, p.goal, {
                activity: activityLabel(p.goal.activity_key),
                exercise: exerciseName(p.goal.exercise_id),
              })}
          </p>
          {completed && (
            <span
              className={cn(
                'inline-flex shrink-0 items-center gap-0.5 rounded-full bg-gold/10 px-1.5 py-0.5 text-[10px] font-semibold text-gold',
                justCompleted && 'animate-glow-pulse',
              )}
            >
              <CircleCheck className="h-3 w-3" aria-hidden />
              {t('goals.achieved')}
            </span>
          )}
        </div>
        <p className="mt-0.5 font-mono text-xs tabular-nums text-muted-foreground">
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
        {/* Στόχος πάνω σε συγκεκριμένη άσκηση → deep-link στο δικό της chart
            (PR/e1RM/reps/hold), ώστε η πρόοδος να μη μένει «νησί». */}
        {p.goal.exercise_id != null && (
          <Link
            to={`/progress?exerciseId=${p.goal.exercise_id}`}
            className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            <LineChart className="h-3 w-3" aria-hidden />
            {t('goals.viewProgress')}
          </Link>
        )}
        {/* Στόχος συχνότητας/εβδομάδα → πρόγραμμα(τα) με δικό τους weekly
            target, ίδιο εύρος αθλήματος (ή «όλα»). */}
        {isFrequencyGoal && <GoalProgramLink goal={p.goal} />}
      </div>
      <div className="flex shrink-0 flex-col">
        <button
          onClick={() => onMove(index, -1)}
          disabled={index === 0}
          aria-label={t('goals.moveUp')}
          className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronUp className="h-4 w-4" />
        </button>
        <button
          onClick={() => onMove(index, 1)}
          disabled={index === total - 1}
          aria-label={t('goals.moveDown')}
          className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-30"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>
      <div className="flex shrink-0 flex-col">
        <button
          onClick={() => onEdit(p.goal)}
          aria-label={t('common.edit')}
          className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          onClick={() => onDelete(p.goal.id)}
          aria-label={t('common.delete')}
          className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-destructive active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </li>
  );
}
