import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { formatHMS } from '@/hooks/useSessionTimer';
import { getRecentPRs, listActivities, listAllExercises, listCompletedWorkouts } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight } from '@/lib/units';
import type { PRType } from '@/lib/db/types';
import { VolumeChart } from './components/VolumeChart';
import { FeelChart } from './components/FeelChart';
import { Link } from 'react-router-dom';

/** PR types που είναι βάρος (kg storage) — τα υπόλοιπα δεν μετατρέπονται. */
const WEIGHT_PR_TYPES: ReadonlySet<PRType> = new Set(['max_weight', 'max_volume', 'e1rm']);

export function HistoryPage() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';

  const completed = useLiveQuery(() => listCompletedWorkouts(), []);

  const list = completed ?? [];

  const prs = useLiveQuery(() => getRecentPRs(8), [], []);
  // listAllExercises (όχι db.exercises.toArray()): οι δικές σου ασκήσεις
  // δεν πρέπει να διαρρέουν στο ιστορικό άλλου προφίλ. Παίρνουμε ΚΑΙ τις
  // αρχειοθετημένες γιατί ένα PR μπορεί να αναφέρεται σε άσκηση που έκτοτε
  // αρχειοθέτησες.
  const exerciseNames = useLiveQuery(
    async () => new Map((await listAllExercises()).map((e) => [e.id, e.name])),
    [],
    new Map<string, string>(),
  );
  const activityLabels = useLiveQuery(
    async () => new Map((await listActivities(true)).map((a) => [a.key, a.label])),
    [],
    new Map<string, string>(),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('history.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {list.length} {t('history.completed')}
        </p>
      </header>

      <Link
        to="/progress"
        className="block rounded-lg bg-card px-4 py-3 text-sm transition-colors hover:bg-elevated"
      >
        {t('progress.title')} →
      </Link>

      <VolumeChart />
      <FeelChart />

      {prs.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-medium">{t('history.recentPRs')}</h2>
          <ul className="divide-y divide-border/60 rounded-lg bg-card">
            {prs.map((pr) => (
              <li key={pr.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="text-gold" aria-hidden>
                  ★
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {pr.exercise_id
                      ? (exerciseNames.get(pr.exercise_id) ?? '—')
                      : pr.activity_kind
                        ? (activityLabels.get(pr.activity_kind) ?? pr.activity_kind)
                        : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`history.pr.${pr.type}`)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">
                    {WEIGHT_PR_TYPES.has(pr.type)
                      ? formatWeight(pr.value, unit)
                      : Math.round(pr.value * 10) / 10}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {new Date(pr.achieved_at).toLocaleDateString()}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        <div className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
          {t('history.empty')}
        </div>
      ) : (
        <ul className="stagger space-y-2">
          {/* Κάθε γραμμή ανοίγει την προπόνηση — πριν ήταν στατικό κείμενο. */}
          {list.map((w) => (
            <li key={w.id}>
              <Link
                to={`/history/${w.id}`}
                className="block rounded-lg bg-card p-3 transition-colors hover:bg-elevated"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <p className="truncate text-sm font-medium">
                    {w.workout_type ?? t('workout.title')}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {new Date(w.started_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-1 flex gap-3 font-mono text-xs text-muted-foreground">
                  <span>{formatHMS(w.duration_seconds ?? 0)}</span>
                  <span>·</span>
                  <span>
                    {new Date(w.started_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
