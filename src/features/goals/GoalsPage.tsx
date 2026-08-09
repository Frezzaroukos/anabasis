import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronDown, ChevronUp, Pencil, Plus, Target, Trash2 } from 'lucide-react';
import {
  deleteGoal,
  getAllGoalProgress,
  listGoals,
  reorderGoals,
  type GoalProgress,
} from '@/lib/db/goals';
import { listActivities, listExercises } from '@/lib/db/queries';
import type { Goal } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { GoalFormSheet } from './components/GoalFormSheet';
import { goalTitle } from './goalTitle';

/**
 * Οι στόχοι του χρήστη — μία λίστα, με τη σειρά που τους έβαλε.
 *
 * Ο κάθε στόχος είναι τέσσερις ανεξάρτητες επιλογές (μέτρο × ποσό × περίοδος
 * × εύρος). Δεν προσφέρουμε «έτοιμους» στόχους στην αρχή: ένας στόχος που
 * δεν όρισε ο χρήστης δεν είναι στόχος, είναι θόρυβος — και θα εμφάνιζε
 * πρόοδο προς κάτι που κανείς δεν ζήτησε.
 */
export function GoalsPage() {
  const { t } = useTranslation();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Goal | null>(null);

  const progress = useLiveQuery(() => getAllGoalProgress(), [], []);
  const activities = useLiveQuery(() => listActivities(true), [], []);
  const exercises = useLiveQuery(() => listExercises(), [], []);

  const activityLabel = (key: string | null) =>
    key == null ? null : (activities.find((a) => a.key === key)?.label ?? key);
  const exerciseName = (id: string | null) =>
    id == null ? null : (exercises.find((e) => e.id === id)?.name ?? null);

  const move = async (index: number, delta: number) => {
    const goals = await listGoals();
    const target = index + delta;
    if (target < 0 || target >= goals.length) return;
    const next = [...goals];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    await reorderGoals(next.map((g) => g.id));
  };

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (g: Goal) => {
    setEditing(g);
    setFormOpen(true);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('goals.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('goals.intro')}</p>
      </header>

      {progress.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border p-8 text-center">
          <Target className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">{t('goals.emptyTitle')}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t('goals.emptyHint')}</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {progress.map((p: GoalProgress, index: number) => (
            <li
              key={p.goal.id}
              className="flex items-center gap-3 rounded-xl border border-border/70 bg-card p-4"
            >
              <ProgressRing
                value={p.current}
                max={p.target}
                size={64}
                thickness={6}
                label={`${Math.round(p.ratio * 100)}%`}
              />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {p.goal.label ??
                    goalTitle(t, p.goal, {
                      activity: activityLabel(p.goal.activity_key),
                      exercise: exerciseName(p.goal.exercise_id),
                    })}
                </p>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  {p.current} / {p.target} {p.unit}
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
                  onClick={() => void move(index, -1)}
                  disabled={index === 0}
                  aria-label={t('goals.moveUp')}
                  className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void move(index, 1)}
                  disabled={index === progress.length - 1}
                  aria-label={t('goals.moveDown')}
                  className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <div className="flex shrink-0 flex-col">
                <button
                  onClick={() => openEdit(p.goal)}
                  aria-label={t('common.edit')}
                  className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => void deleteGoal(p.goal.id)}
                  aria-label={t('common.delete')}
                  className="flex h-9 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" className="w-full" onClick={openCreate}>
        <Plus className="h-4 w-4" />
        {t('goals.new')}
      </Button>

      <GoalFormSheet open={formOpen} onClose={() => setFormOpen(false)} goal={editing} />
    </div>
  );
}
