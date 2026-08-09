import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { Flame, User } from 'lucide-react';
import { getCurrentProfile, getTrainingInsights } from '@/lib/db/queries';
import { DEFAULT_USER_ID } from '@/lib/db/session';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Wordmark } from '@/components/Logo';
import { resolveCardOrder, type DashboardCardKey } from './cards';
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

  const profile = useLiveQuery(() => getCurrentProfile(), [], undefined);
  // Το προεπιλεγμένο προφίλ έχει γενικό όνομα — χαιρετάμε μόνο όποιον το όρισε.
  const profileName =
    profile?.display_name && profile.id !== DEFAULT_USER_ID ? profile.display_name : null;

  const order = resolveCardOrder(settings?.dashboard_cards);

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
          <h1 className="text-2xl font-semibold tracking-tight">
            {profileName ? t('dashboard.welcomeBack', { name: profileName }) : t('dashboard.title')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{t('dashboard.subtitle')}</p>
        </div>
      </header>

      {order
        .filter((c) => c.visible)
        .map(({ key }) => {
          const Comp = CARD_COMPONENTS[key as DashboardCardKey];
          return <Comp key={key} />;
        })}

      <EmptyDashboardHint />
    </div>
  );
}
