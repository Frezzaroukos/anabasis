import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { User } from 'lucide-react';
import { getCurrentProfile, getTrainingInsights } from '@/lib/db/queries';
import { DEFAULT_USER_ID } from '@/lib/db/session';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCountUp } from '@/hooks/useCountUp';
import { Wordmark } from '@/components/Logo';
import { cn } from '@/lib/utils';
import { FULL_WIDTH, resolveCardOrder, type DashboardCardKey } from './cards';
import { SkillLadderCard } from './components/SkillLadderCard';
import { StartWorkoutCta } from './components/StartWorkoutCta';
import { GoalsCard } from './components/GoalsCard';
import { InsightsCard } from './components/InsightsCard';
import { ConsistencyHeatmap } from './components/ConsistencyHeatmap';
import { ConsistencyStrip } from './components/ConsistencyStrip';
import { WeeklyVolumeCard } from './components/WeeklyVolumeCard';
import { RecentPRsCard } from './components/RecentPRsCard';
import { SkillsProgressCard } from './components/SkillsProgressCard';
import { BodySummaryCard } from './components/BodySummaryCard';
import { EmptyDashboardHint } from './components/EmptyDashboardHint';

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
  // Ανεβαίνει από 0 στην τελική τιμή όταν λύνεται το liveQuery — ο αριθμός
  // «ζωντανεύει» αντί να εμφανίζεται απότομα (DESIGN-SPEC-V2, motion).
  const animatedStreak = useCountUp(streakDays);

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
        WHOOP-style hero: ΕΝΑ μεγάλο νούμερο (το σερί) διαβάζεται από απόσταση,
        πάνω από τα tiles — αντί για «κουτί-σε-κουτί» (γνωστό feedback).
        Χωρίς ενεργό σερί δεν δείχνουμε ψεύτικο «0» (ίδια λογική με τις
        υπόλοιπες κάρτες), μένει μόνο ο τίτλος.
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
          <h1
            className={cn(
              streakDays > 0
                ? 'text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground'
                : 'font-display text-2xl font-semibold tracking-tight text-foreground',
            )}
          >
            {profileName ? t('dashboard.welcomeBack', { name: profileName }) : t('dashboard.title')}
          </h1>
          {streakDays > 0 && (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-display text-5xl font-semibold leading-none tracking-tight tabular-nums text-foreground [filter:drop-shadow(0_0_14px_hsl(var(--primary)/0.3))]">
                {animatedStreak}
              </span>
              <span className="font-display text-base font-semibold text-muted-foreground">
                {t('dashboard.hero.streakUnit')}
              </span>
            </div>
          )}
          <p className="mt-1.5 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
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
