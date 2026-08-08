import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Flame, Minus, Play, TrendingDown, TrendingUp, User } from 'lucide-react';
import {
  getAllSkillProgress,
  getBodyMetric,
  getBodyTrend,
  getCurrentProfile,
  getRecentPRs,
  getTrainingInsights,
  getTrainingSummary,
  getVolumeTrend,
  listActivities,
  listExercises,
  localDay,
} from '@/lib/db/queries';
import { DEFAULT_USER_ID } from '@/lib/db/session';
import { cn } from '@/lib/utils';
import { Wordmark } from '@/components/Logo';
import { Card, SectionTitle } from '@/components/ui/Section';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { InsightsCard } from './components/InsightsCard';
import { ConsistencyHeatmap } from './components/ConsistencyHeatmap';
import { SkillLadderCard } from './components/SkillLadderCard';

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
  const insights = useLiveQuery(() => getTrainingInsights(30), [], null);
  const streakDays = insights?.streakDays ?? 0;
  const profile = useLiveQuery(() => getCurrentProfile(), [], undefined);
  // Το default προφίλ έχει γενικό όνομα — χαιρετάμε μόνο όποιον το όρισε ο ίδιος.
  const profileName =
    profile?.display_name && profile.id !== DEFAULT_USER_ID ? profile.display_name : null;

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
    <div className="stagger space-y-6">
      {/*
        App bar: ταυτότητα αριστερά, κατάσταση + προφίλ δεξιά. Πριν υπήρχε
        μόνο ένας τίτλος «Overview» και ένα logo να αιωρείται στη γωνία —
        δεν έλεγε ποιος είσαι ούτε πώς πας.
      */}
      <header className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <Wordmark />
          <div className="flex items-center gap-2">
            {streakDays > 0 && (
              <span
                className="flex items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1"
                title={t('insights.streak', { count: streakDays })}
              >
                <Flame className="h-3.5 w-3.5 text-[hsl(var(--gold))]" />
                <span className="font-mono text-xs">{streakDays}</span>
              </span>
            )}
            <Link
              to="/profile"
              aria-label={t('profile.title')}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-border/70 bg-card text-muted-foreground transition-colors hover:text-foreground"
            >
              <User className="h-4 w-4" />
            </Link>
          </div>
        </div>
        <div>
          {/*
            Με προφίλ: χαιρετισμός με το όνομα. Χωρίς: ο ουδέτερος τίτλος —
            ΔΕΝ επινοούμε όνομα ούτε γράφουμε «Welcome back, athlete».
          */}
          <h1 className="text-2xl font-semibold tracking-tight">
            {profileName ? t('dashboard.welcomeBack', { name: profileName }) : t('dashboard.title')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
      </header>

      {/* Το διαφοροποιητικό πρώτο: πού είσαι στη σκάλα του ενεργού skill. */}
      <SkillLadderCard />

      {/* Hero: η #1 ενέργεια μιας fitness app είναι «ξεκίνα». Χρυσό, prominent,
          σπάει το «κουτί-σε-κουτί» — δίνει σαφή πρωταρχική δράση, όχι ισοπεδωμένα tiles. */}
      <Link
        to="/workout"
        className="flex items-center justify-between gap-3 rounded-xl bg-primary px-5 py-4 text-primary-foreground shadow-sm transition-transform active:scale-[0.99]"
      >
        <span>
          <span className="block text-lg font-semibold">{t('dashboard.startCta')}</span>
          <span className="block text-xs opacity-70">
            {summary7.activeDays > 0
              ? t('dashboard.activeThisWeek', { count: summary7.activeDays })
              : t('dashboard.startSub')}
          </span>
        </span>
        {/* Το εικονίδιο επιβεβαιώνει τη δράση — δεν διεκδικεί την προσοχή. */}
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
          <Play className="h-4 w-4 fill-current" />
        </span>
      </Link>

      {!hasAnyData && (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t('dashboard.noData')}
        </div>
      )}

      <InsightsCard />
      <ConsistencyHeatmap />

      {/* Λεπτή γραμμή συνέπειας — όχι κουτί: μετρά ενεργές μέρες (και εν εξελίξει
          προπονήσεις), κρατά τα νούμερα ορατά χωρίς να προσθέτει άλλο ένα box. */}
      {hasTrainingData && (
        <div className="flex items-center gap-5 px-1 text-xs text-muted-foreground">
          <span className="font-semibold uppercase tracking-[0.08em] text-muted-foreground/80">
            {t('dashboard.consistency')}
          </span>
          <span>
            {t('dashboard.last7days')}{' '}
            <span className="font-mono text-foreground">{summary7.activeDays}/7</span>
          </span>
          <span>
            {t('dashboard.last30days')}{' '}
            <span className="font-mono text-foreground">{summary30.activeDays}/30</span>
          </span>
        </div>
      )}

      {showVolumeCompare && (
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('dashboard.weeklyVolume')}
            </h2>
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
          <div className="mt-2 flex items-center justify-between gap-4">
            <div>
              <p className="font-mono text-3xl leading-none">
                {Math.round(thisWeekVolume / 1000)}
                <span className="text-lg text-muted-foreground">k</span>{' '}
                <span className="font-sans text-xs text-muted-foreground">
                  kg · {t('dashboard.thisWeek')}
                </span>
              </p>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {t('dashboard.vsLastWeek')}: {Math.round(lastWeekVolume / 1000)}k kg
              </p>
            </div>
            {/*
              Ο δακτύλιος συγκρίνει με την ΠΕΡΑΣΜΕΝΗ εβδομάδα — πραγματικό
              μέγεθος, όχι εφευρεμένος στόχος. Εμφανίζεται μόνο αν υπάρχει
              περασμένη εβδομάδα να συγκριθεί, αλλιώς δεν σημαίνει τίποτα.
            */}
            {lastWeekVolume > 0 && (
              <ProgressRing
                value={Math.min(thisWeekVolume, lastWeekVolume)}
                max={lastWeekVolume}
                size={76}
                thickness={7}
                label={`${Math.round((thisWeekVolume / lastWeekVolume) * 100)}%`}
                sub={t('dashboard.ofLastWeek')}
              />
            )}
          </div>
        </Card>
      )}

      {prs.length > 0 && (
        <Link
          to="/history"
          className="block rounded-xl border border-border/70 bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <SectionTitle action={<span className="text-muted-foreground">→</span>}>
            {t('history.recentPRs')}
          </SectionTitle>
          <ul className="divide-y divide-border/60">
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
          className="block rounded-xl border border-border/70 bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <SectionTitle action={<span className="text-muted-foreground">→</span>}>
            {t('dashboard.skillsProgress')}
          </SectionTitle>
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
          className="block rounded-xl border border-border/70 bg-card p-4 transition-colors hover:bg-muted/40"
        >
          <SectionTitle action={<span className="text-muted-foreground">→</span>}>
            {t('body.title')}
          </SectionTitle>
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
