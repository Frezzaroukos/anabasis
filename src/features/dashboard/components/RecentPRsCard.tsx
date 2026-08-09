import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Trophy } from 'lucide-react';
import { getRecentPRs, listActivities, listExercises } from '@/lib/db/queries';
import { SectionTitle } from '@/components/ui/Section';

/**
 * Τα τελευταία ρεκόρ.
 *
 * Κάθε γραμμή είναι ΣΥΝΔΕΣΜΟΣ προς την πρόοδο της άσκησης: ένα PR γεννά
 * αμέσως την ερώτηση «πώς πάω σε αυτή την άσκηση;» και πριν αυτό ήταν
 * αδιέξοδο — έβλεπες το νούμερο και δεν πήγαινες πουθενά.
 */
export function RecentPRsCard() {
  const { t } = useTranslation();
  const prs = useLiveQuery(() => getRecentPRs(4), [], []);
  const exercises = useLiveQuery(() => listExercises(), [], []);
  const activities = useLiveQuery(() => listActivities(true), [], []);

  if (prs.length === 0) return null;

  const exerciseNames = new Map(exercises.map((e) => [e.id, e.name]));
  const activityLabels = new Map(activities.map((a) => [a.key, a.label]));

  return (
    <section className="rounded-xl border border-border/70 bg-card p-4">
      <SectionTitle
        action={
          <Link to="/history" className="text-xs text-muted-foreground hover:text-foreground">
            {t('dashboard.viewAll')} →
          </Link>
        }
      >
        {t('history.recentPRs')}
      </SectionTitle>

      <ul className="divide-y divide-border/60">
        {prs.map((pr) => {
          const name = pr.exercise_id
            ? (exerciseNames.get(pr.exercise_id) ?? '—')
            : pr.activity_kind
              ? (activityLabels.get(pr.activity_kind) ?? pr.activity_kind)
              : '—';
          // Δείκτης προόδου υπάρχει μόνο για ασκήσεις· τα PR δραστηριότητας
          // (π.χ. μεγαλύτερη απόσταση) δεν έχουν αντίστοιχη σελίδα ακόμα.
          const to = pr.exercise_id ? `/progress?exerciseId=${pr.exercise_id}` : '/history';

          return (
            <li key={pr.id}>
              <Link
                to={to}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40"
              >
                <Trophy className="h-4 w-4 shrink-0 text-[hsl(var(--gold))]" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{name}</p>
                  <p className="text-xs text-muted-foreground">{t(`history.pr.${pr.type}`)}</p>
                </div>
                <p className="font-mono text-sm">{Math.round(pr.value * 10) / 10}</p>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
