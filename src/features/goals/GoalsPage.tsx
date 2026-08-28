import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus, Target } from 'lucide-react';
import { deleteGoal, getAllGoalProgress, listGoals, reorderGoals } from '@/lib/db/goals';
import { listActivities, listExercises } from '@/lib/db/queries';
import type { Goal } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { GoalFormSheet } from './components/GoalFormSheet';
import { GoalRow } from './components/GoalRow';

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
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('goals.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('goals.intro')}</p>
      </header>

      {progress.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Target className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">{t('goals.emptyTitle')}</p>
          <p className="max-w-xs text-xs text-muted-foreground">{t('goals.emptyHint')}</p>
        </div>
      ) : (
        <ul className="stagger space-y-3">
          {progress.map((p, index) => (
            <GoalRow
              key={p.goal.id}
              progress={p}
              index={index}
              total={progress.length}
              activityLabel={activityLabel}
              exerciseName={exerciseName}
              onMove={(i, delta) => void move(i, delta)}
              onEdit={openEdit}
              onDelete={(id) => void deleteGoal(id)}
            />
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
