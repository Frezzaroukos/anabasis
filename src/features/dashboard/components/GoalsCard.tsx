import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAllGoalProgress } from '@/lib/db/goals';
import { listActivities, listExercises, listSkills } from '@/lib/db/queries';
import { listTrackers } from '@/lib/db/trackers';
import { SectionTitle } from '@/components/ui/Section';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { goalTitle } from '@/features/goals/goalTitle';

/**
 * Οι στόχοι του χρήστη στην Αρχική — δακτύλιος ανά στόχο.
 *
 * Δεν εμφανίζεται καθόλου αν δεν έχει οριστεί στόχος. Ένας δακτύλιος στο 0%
 * για κάτι που δεν ζήτησε ο χρήστης δεν είναι κίνητρο, είναι κατηγορία.
 * Δείχνουμε έως 3 — η Αρχική είναι «μια ματιά», η πλήρης λίστα ζει στη
 * σελίδα Στόχων.
 */
const MAX_ON_DASHBOARD = 3;

export function GoalsCard() {
  const { t } = useTranslation();
  const progress = useLiveQuery(() => getAllGoalProgress(), [], []);
  const activities = useLiveQuery(() => listActivities(true), [], []);
  const exercises = useLiveQuery(() => listExercises(), [], []);
  const skills = useLiveQuery(() => listSkills(true), [], []);
  const trackers = useLiveQuery(() => listTrackers(true), [], []);

  if (progress.length === 0) return null;
  const shown = progress.slice(0, MAX_ON_DASHBOARD);

  return (
    <Link
      to="/goals"
      className="block rounded-xl bg-card p-4 ring-offset-background transition-all duration-150 hover:bg-elevated active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <SectionTitle
        action={
          progress.length > MAX_ON_DASHBOARD ? (
            <span className="text-xs text-muted-foreground">
              +{progress.length - MAX_ON_DASHBOARD}
            </span>
          ) : (
            <span className="text-muted-foreground">→</span>
          )
        }
      >
        {t('goals.title')}
      </SectionTitle>

      <div className="flex justify-around gap-2">
        {shown.map((p) => (
          <div key={p.goal.id} className="flex min-w-0 flex-1 flex-col items-center gap-2">
            <ProgressRing
              value={p.current}
              max={p.target}
              size={72}
              thickness={6}
              label={`${Math.round(p.ratio * 100)}%`}
              tone={p.ratio >= 1 ? 'gold' : 'primary'}
            />
            <span className="line-clamp-2 text-center text-[10px] leading-tight text-muted-foreground">
              {p.goal.label ??
                goalTitle(t, p.goal, {
                  activity: p.goal.activity_key
                    ? (activities.find((a) => a.key === p.goal.activity_key)?.label ?? null)
                    : null,
                  exercise: p.goal.exercise_id
                    ? (exercises.find((e) => e.id === p.goal.exercise_id)?.name ?? null)
                    : null,
                  skill: p.goal.skill_id
                    ? (skills.find((s) => s.id === p.goal.skill_id)?.name ?? null)
                    : null,
                  custom: p.goal.custom_tracker_id
                    ? (trackers.find((tr) => tr.id === p.goal.custom_tracker_id)?.name ?? null)
                    : null,
                })}
            </span>
          </div>
        ))}
      </div>
    </Link>
  );
}
