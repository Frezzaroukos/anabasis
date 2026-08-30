import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import {
  getCalendar,
  getCurrentProfile,
  getTrainingInsights,
  listCompletedWorkouts,
  localDay,
} from '@/lib/db/queries';
import { DEFAULT_USER_ID } from '@/lib/db/session';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCountUp } from '@/hooks/useCountUp';
import { Wordmark } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { FULL_WIDTH, resolveCardOrder, type DashboardCardKey } from './cards';
import { SkillLadderCard } from './components/SkillLadderCard';
import { StartWorkoutCta } from './components/StartWorkoutCta';
import { RecentActivityCard } from './components/RecentActivityCard';
import { AltitudeCard } from '@/features/achievements/AltitudeCard';
import { GoalsCard } from './components/GoalsCard';
import { InsightsCard } from './components/InsightsCard';
import { ConsistencyHeatmap } from './components/ConsistencyHeatmap';
import { ConsistencyStrip } from './components/ConsistencyStrip';
import { WeeklyVolumeCard } from './components/WeeklyVolumeCard';
import { RecentPRsCard } from './components/RecentPRsCard';
import { SkillsProgressCard } from './components/SkillsProgressCard';
import { BodySummaryCard } from './components/BodySummaryCard';
import { EmptyDashboardHint } from './components/EmptyDashboardHint';
import { WeekStrip } from './components/WeekStrip';
import { mondayOf } from './components/weekMath';

/** Πόσες πλήρεις μέρες πέρασαν από ένα ISO timestamp μέχρι σήμερα (τοπικά). */
function daysSince(iso: string): number {
  const start = new Date(iso);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.max(0, Math.round((today - startDay) / 86_400_000));
}

type HeroTier = 'streak' | 'week' | 'last';

/** i18n κλειδί της ετικέτας κάτω από το μεγάλο νούμερο, ανά βαθμίδα του hero. */
const HERO_UNIT_KEY: Record<HeroTier, string> = {
  streak: 'dashboard.hero.streakUnit',
  week: 'dashboard.hero.weekUnit',
  last: 'dashboard.hero.lastSessionUnit',
};

/**
 * «Μια ματιά».
 *
 * Η σελίδα δεν ξέρει τι περιέχει κάθε κάρτα — μόνο ΠΟΙΕΣ υπάρχουν και με τι
 * σειρά τις θέλει ο χρήστης. Κάθε κάρτα κάνει τα δικά της queries και
 * επιστρέφει `null` όταν δεν έχει δεδομένα, οπότε:
 *  - μια κρυμμένη κάρτα δεν εκτελεί καθόλου ερωτήματα (όχι απλώς κρύβεται),
 *  - η προσθήκη κάρτας δεν αγγίζει αυτό το αρχείο πέρα από μία γραμμή,
 *  - καμία κάρτα δεν δείχνει μηδενικά· απουσία δεδομένων = απουσία κάρτας.
 *
 * Ήταν 396 γραμμές με 9 queries και όλες τις κάρτες inline — κάθε αλλαγή σε
 * μία κάρτα σήμαινε ανάγνωση ολόκληρης της σελίδας.
 */
const CARD_COMPONENTS: Record<DashboardCardKey, React.ComponentType> = {
  skillLadder: SkillLadderCard,
  cta: StartWorkoutCta,
  recentActivity: RecentActivityCard,
  altitude: AltitudeCard,
  goals: GoalsCard,
  insights: InsightsCard,
  heatmap: ConsistencyHeatmap,
  consistency: ConsistencyStrip,
  volume: WeeklyVolumeCard,
  prs: RecentPRsCard,
  skills: SkillsProgressCard,
  body: BodySummaryCard,
};

export function DashboardPage() {
  const { t } = useTranslation();
  const settings = useAppSettings();

  const insights = useLiveQuery(() => getTrainingInsights(30), [], null);
  const streakDays = insights?.streakDays ?? 0;

  // Fallback ladder όταν δεν υπάρχει σερί: μέρες προπόνησης ΑΥΤΗ την
  // εβδομάδα (ίδιο Δευτέρα→Κυριακή παράθυρο με το WeekStrip από κάτω),
  // αλλιώς πόσες μέρες πέρασαν από την τελευταία προπόνηση. Το hero ΔΕΝ
  // καταρρέει πια σε γυμνό τίτλο όποτε σπάει το σερί (owner feedback).
  const weekBounds = useMemo(() => {
    const monday = mondayOf(new Date());
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return { from: localDay(monday), to: localDay(sunday) };
  }, []);
  const weekCal = useLiveQuery(
    () => getCalendar(weekBounds.from, weekBounds.to),
    [weekBounds.from, weekBounds.to],
    undefined,
  );
  const activeDaysThisWeek = weekCal
    ? [...weekCal.values()].filter((d) => d.workouts.length > 0).length
    : 0;

  const completedWorkouts = useLiveQuery(() => listCompletedWorkouts(), [], undefined);
  const lastWorkout = completedWorkouts?.[0];

  // undefined σε ΟΠΟΙΟΔΗΠΟΤΕ από τα τρία = ακόμα φορτώνει — skeleton αντί για
  // στιγμιαίο «κενό» hero που μετά γεμίζει (undefined=loading, όχι []=empty).
  const heroLoading = insights === null || weekCal === undefined || completedWorkouts === undefined;

  let heroTier: HeroTier | null = null;
  let heroValue = 0;
  if (streakDays > 0) {
    heroTier = 'streak';
    heroValue = streakDays;
  } else if (activeDaysThisWeek > 0) {
    heroTier = 'week';
    heroValue = activeDaysThisWeek;
  } else if (lastWorkout) {
    heroTier = 'last';
    heroValue = daysSince(lastWorkout.started_at);
  }
  // Ανεβαίνει από 0 στην τελική τιμή όταν λύνεται το liveQuery — ο αριθμός
  // «ζωντανεύει» αντί να εμφανίζεται απότομα (DESIGN-SPEC-V2, motion).
  const animatedHeroValue = useCountUp(heroValue);

  const profile = useLiveQuery(() => getCurrentProfile(), [], undefined);
  // Το προεπιλεγμένο προφίλ έχει γενικό όνομα — χαιρετάμε μόνο όποιον το όρισε.
  const profileName =
    profile?.display_name && profile.id !== DEFAULT_USER_ID ? profile.display_name : null;

  const order = resolveCardOrder(settings?.dashboard_cards);

  return (
    /* Κινητό: στοίβα. ≥md: δύο στήλες — αλλιώς το φαρδύ παράθυρο απλώς
       μακραίνει τη σελίδα αντί να τη γεμίζει. */
    <div className="stagger space-y-6 md:grid md:grid-cols-2 md:items-start md:gap-5 md:space-y-0">
      {/*
        WHOOP-style hero: ΕΝΑ μεγάλο νούμερο διαβάζεται από απόσταση, πάνω
        από τα tiles — αντί για «κουτί-σε-κουτί» (γνωστό feedback). Σερί →
        μέρες αυτή την εβδομάδα → τελευταία προπόνηση → μόνο τότε (καθόλου
        ιστορικό ποτέ) μένει απλός τίτλος· ΔΕΝ δείχνουμε ποτέ ψεύτικο «0».
      */}
      <header className="space-y-4 md:col-span-2">
        <div className="flex items-center justify-between gap-2 md:justify-end">
          <Wordmark className="md:hidden" />
          <Link
            to="/profile"
            aria-label={t('profile.title')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-card text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
          >
            <User className="h-4 w-4" />
          </Link>
        </div>
        <div>
          {heroLoading ? (
            <div className="space-y-2">
              <div className="h-3 w-32 animate-pulse rounded bg-muted/40" />
              <div className="h-11 w-24 animate-pulse rounded bg-muted/40" />
            </div>
          ) : (
            <>
              <h1
                className={cn(
                  heroTier != null
                    ? 'text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'
                    : 'font-display text-2xl font-semibold tracking-tight text-foreground',
                )}
              >
                {profileName ? t('dashboard.welcomeBack', { name: profileName }) : t('dashboard.title')}
              </h1>
              {heroTier != null && (
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="font-display text-5xl font-semibold leading-none tracking-tight tabular-nums text-foreground [filter:drop-shadow(0_0_14px_hsl(var(--primary)/0.3))]">
                    {animatedHeroValue}
                  </span>
                  <span className="font-display text-base font-semibold text-muted-foreground">
                    {t(HERO_UNIT_KEY[heroTier])}
                  </span>
                </div>
              )}
            </>
          )}
          <p className="mt-1.5 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
        <WeekStrip />
      </header>

      {order
        .filter((c) => c.visible)
        .map(({ key }) => {
          const Comp = CARD_COMPONENTS[key as DashboardCardKey];
          const full = FULL_WIDTH.includes(key as DashboardCardKey);
          return (
            /* `empty:hidden`: μια κάρτα χωρίς δεδομένα επιστρέφει null και το
               wrapper θα κρατούσε κενό κελί στο grid. */
            <div
              key={key}
              className={cn('empty:hidden', full && 'md:col-span-2')}
            >
              <Comp />
            </div>
          );
        })}

      <div className="empty:hidden md:col-span-2">
        <EmptyDashboardHint />
      </div>
    </div>
  );
}
