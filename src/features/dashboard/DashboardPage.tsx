import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import {
  getAllSkillProgress,
  getBodyMetric,
  getBodyTrend,
  getRecentPRs,
  getTrainingSummary,
  getVolumeTrend,
  listActivities,
  listExercises,
  localDay,
} from '@/lib/db/queries';
import { cn } from '@/lib/utils';
import { InsightsCard } from './components/InsightsCard';
import { ConsistencyHeatmap } from './components/ConsistencyHeatmap';

/**
 * Σελίδες που δεν έχουν tab στο bottom nav — πρέπει να είναι προσβάσιμες
 * από εδώ με ένα tap, ανεξάρτητα από το αν υπάρχουν ήδη δεδομένα.
 */
const QUICK_LINKS = [
  { to: '/body', labelKey: 'body.title' },
  { to: '/history', labelKey: 'history.title' },
  { to: '/progress', labelKey: 'progress.title' },
] as const;

/**
 * «Μια ματιά»: η πρώτη οθόνη που βλέπει ο χρήστης. Κάθε section κρύβεται αν
 * δεν υπάρχουν δεδομένα — ένα tile με μηδενικά είναι παραπλανητικό (δείχνει
 * σαν να μετρήθηκε κάτι, ενώ απλά δεν υπάρχει ακόμα καταγραφή).
 */
export function DashboardPage() {
  const { t } = useTranslation();
  const today = localDay();

  const summary7 = useLiveQuery(
    () => getTrainingSummary(7),
    [],
    { totalVolume: 0, totalSets: 0, activeDays: 0, days: 7 },
  );
  const summary30 = useLiveQuery(
    () => getTrainingSummary(30),
    [],
    { totalVolume: 0, totalSets: 0, activeDays: 0, days: 30 },
  );
  // 14 μέρες ώστε να συγκρίνουμε τρέχουσα εβδομάδα με την προηγούμενη.
  const trend14 = useLiveQuery(() => getVolumeTrend(14), [], []);
  const prs = useLiveQuery(() => getRecentPRs(4), [], []);
  const skillProgress = useLiveQuery(() => getAllSkillProgress(), [], new Map());
  const bodyTrend = useLiveQuery(() => getBodyTrend(30), [], []);
  const todayMetric = useLiveQuery(() => getBodyMetric(today), [today]);
  const exercises = useLiveQuery(() => listExercises(), [], []);
  const activities = useLiveQuery(() => listActivities(true), [], []);

  const exerciseNames = new Map(exercises.map((e) => [e.id, e.name]));
  const activityLabels = new Map(activities.map((a) => [a.key, a.label]));

  const hasTrainingData = summary30.totalSets > 0;

  const thisWeekVolume = trend14.slice(7).reduce((a, p) => a + p.volume, 0);
  const lastWeekVolume = trend14.slice(0, 7).reduce((a, p) => a + p.volume, 0);
  const volumeDelta = thisWeekVolume - lastWeekVolume;
  const volumeDeltaPct =
    lastWeekVolume > 0 ? Math.round((volumeDelta / lastWeekVolume) * 100) : null;
  const showVolumeCompare = thisWeekVolume > 0 || lastWeekVolume > 0;

  let skillsInProgress = 0;
  let skillsMastered = 0;
  for (const p of skillProgress.values()) {
    if (p.status === 'in_progress') skillsInProgress += 1;
    if (p.status === 'mastered') skillsMastered += 1;
  }
  const hasSkillData = skillsInProgress + skillsMastered > 0;

  const weightPoints = bodyTrend.filter((p) => p.weight != null);
  const latestWeight = weightPoints.at(-1)?.weight ?? null;
  const firstWeight = weightPoints[0]?.weight ?? null;
  const weightDelta =
    latestWeight != null && firstWeight != null ? latestWeight - firstWeight : null;

  const bodyFatPoints = bodyTrend.filter((p) => p.bodyFatPct != null);
  const latestBF = bodyFatPoints.at(-1)?.bodyFatPct ?? null;
  const firstBF = bodyFatPoints[0]?.bodyFatPct ?? null;
  const bfDelta = latestBF != null && firstBF != null ? latestBF - firstBF : null;

  const todayBalance =
    todayMetric?.calories_in != null && todayMetric?.calories_out != null
      ? todayMetric.calories_in - todayMetric.calories_out
      : null;

  const hasAnyData =
    hasTrainingData ||
    prs.length > 0 ||
    hasSkillData ||
    latestWeight != null ||
    latestBF != null ||
    todayBalance != null;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">{t('dashboard.title')}</h1>
      </header>

      {/*
        Το Body/History/Progress δεν έχουν tab στο bottom nav — αυτή η σειρά
        είναι ο μόνος δρόμος προς αυτά, γι' αυτό μένει πάντα ορατή (ακόμα και
        χωρίς δεδομένα, ώστε η πρώτη καταγραφή να είναι ένα tap μακριά).
      */}
      <div className="flex gap-2">
        {QUICK_LINKS.map(({ to, labelKey }) => (
          <Link
            key={to}
            to={to}
            className="flex-1 rounded-md border border-border bg-card py-2 text-center text-xs font-medium transition-colors hover:bg-muted/50"
          >
            {t(labelKey)}
          </Link>
        ))}
      </div>

      {!hasAnyData && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t('dashboard.noData')}
        </div>
      )}

      <InsightsCard />
      <ConsistencyHeatmap />

      {hasTrainingData && (
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-medium">{t('dashboard.consistency')}</h2>
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md bg-muted/50 py-2">
              <dt className="text-[10px] uppercase text-muted-foreground">
                {t('dashboard.last7days')}
              </dt>
              <dd className="font-mono text-sm">{summary7.activeDays}/7</dd>
            </div>
            <div className="rounded-md bg-muted/50 py-2">
              <dt className="text-[10px] uppercase text-muted-foreground">
                {t('dashboard.last30days')}
              </dt>
              <dd className="font-mono text-sm">{summary30.activeDays}/30</dd>
            </div>
          </dl>
        </section>
      )}

      {showVolumeCompare && (
        <section className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-medium">{t('dashboard.weeklyVolume')}</h2>
            {volumeDeltaPct != null && (
              // Περισσότερος όγκος = πρόοδος, γι' αυτό πράσινο στην αύξηση εδώ —
              // αντίθετη λογική απ' το βάρος στο BodyPage, όπου η αύξηση δεν είναι
              // αναγκαστικά "καλή". Κάθε μετρική έχει το δικό της νόημα.
              <span
                className={cn(
                  'flex items-center gap-1 font-mono text-xs',
                  volumeDelta > 0
                    ? 'text-emerald-400'
                    : volumeDelta < 0
                      ? 'text-amber-400'
                      : 'text-muted-foreground',
                )}
              >
                {volumeDelta > 0 ? (
                  <TrendingUp className="h-3 w-3" />
                ) : volumeDelta < 0 ? (
                  <TrendingDown className="h-3 w-3" />
                ) : (
                  <Minus className="h-3 w-3" />
                )}
                {volumeDelta > 0 ? '+' : ''}
                {volumeDeltaPct}%
              </span>
            )}
          </div>
          <p className="mt-2 font-mono text-lg">
            {Math.round(thisWeekVolume / 1000)}k{' '}
            <span className="text-xs text-muted-foreground">
              kg · {t('dashboard.thisWeek')}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {t('dashboard.vsLastWeek')}: {Math.round(lastWeekVolume / 1000)}k kg
          </p>
        </section>
      )}

      {prs.length > 0 && (
        <Link
          to="/history"
          className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <h2 className="mb-3 text-sm font-medium">{t('history.recentPRs')} →</h2>
          <ul className="divide-y divide-border">
            {prs.map((pr) => (
              <li key={pr.id} className="flex items-center gap-3 py-2 first:pt-0 last:pb-0">
                <span className="text-amber-500" aria-hidden>
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
                  <p className="text-xs text-muted-foreground">{t(`history.pr.${pr.type}`)}</p>
                </div>
                <p className="font-mono text-sm">{Math.round(pr.value * 10) / 10}</p>
              </li>
            ))}
          </ul>
        </Link>
      )}

      {hasSkillData && (
        <Link
          to="/skills"
          className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <h2 className="mb-3 text-sm font-medium">{t('dashboard.skillsProgress')} →</h2>
          <dl className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-md bg-muted/50 py-2">
              <dt className="text-[10px] uppercase text-muted-foreground">
                {t('skills.inProgress')}
              </dt>
              <dd className="font-mono text-sm">{skillsInProgress}</dd>
            </div>
            <div className="rounded-md bg-muted/50 py-2">
              <dt className="text-[10px] uppercase text-muted-foreground">
                {t('skills.mastered')}
              </dt>
              <dd className="font-mono text-sm">{skillsMastered}</dd>
            </div>
          </dl>
        </Link>
      )}

      {(latestWeight != null || latestBF != null || todayBalance != null) && (
        <Link
          to="/body"
          className="block rounded-lg border border-border bg-card p-4 transition-colors hover:bg-muted/50"
        >
          <h2 className="mb-3 text-sm font-medium">{t('body.title')} →</h2>
          <dl className="grid grid-cols-2 gap-2 text-center">
            {latestWeight != null && (
              <div className="rounded-md bg-muted/50 py-2">
                <dt className="text-[10px] uppercase text-muted-foreground">
                  {t('dashboard.latestWeight')}
                </dt>
                <dd className="font-mono text-sm">
                  {latestWeight} kg
                  {weightDelta != null && (
                    <span
                      className={cn(
                        'ml-1 text-xs',
                        weightDelta > 0
                          ? 'text-amber-400'
                          : weightDelta < 0
                            ? 'text-emerald-400'
                            : 'text-muted-foreground',
                      )}
                    >
                      ({weightDelta > 0 ? '+' : ''}
                      {Math.round(weightDelta * 10) / 10})
                    </span>
                  )}
                </dd>
              </div>
            )}
            {latestBF != null && (
              <div className="rounded-md bg-muted/50 py-2">
                <dt className="text-[10px] uppercase text-muted-foreground">
                  {t('dashboard.latestBodyFat')}
                </dt>
                <dd className="font-mono text-sm">
                  {latestBF}%
                  {bfDelta != null && (
                    <span
                      className={cn(
                        'ml-1 text-xs',
                        bfDelta > 0
                          ? 'text-amber-400'
                          : bfDelta < 0
                            ? 'text-emerald-400'
                            : 'text-muted-foreground',
                      )}
                    >
                      ({bfDelta > 0 ? '+' : ''}
                      {Math.round(bfDelta * 10) / 10})
                    </span>
                  )}
                </dd>
              </div>
            )}
            {todayBalance != null && (
              <div className="rounded-md bg-muted/50 py-2">
                <dt className="text-[10px] uppercase text-muted-foreground">
                  {t('dashboard.todayBalance')}
                </dt>
                <dd
                  className={cn(
                    'font-mono text-sm',
                    todayBalance >= 0 ? 'text-amber-400' : 'text-emerald-400',
                  )}
                >
                  {todayBalance > 0 ? '+' : ''}
                  {todayBalance} kcal
                </dd>
              </div>
            )}
          </dl>
        </Link>
      )}
    </div>
  );
}
