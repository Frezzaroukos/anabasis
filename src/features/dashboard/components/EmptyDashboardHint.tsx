import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Scale, Sparkles, Target, Dumbbell } from 'lucide-react';
import { getLatestBodyweight, hasAnyCompletedWorkout } from '@/lib/db/queries';
import { listGoals } from '@/lib/db/goals';
import { getAllSkillProgress } from '@/lib/db/queries';

/**
 * Τι να κάνεις μετά, όταν η Αρχική είναι ακόμα άδεια.
 *
 * Χωρίς αυτό, ένας νέος χρήστης έβλεπε το κουμπί «Πρόσθεσε προπόνηση» και
 * μετά μισή οθόνη κενό μαύρο — σωστό (δεν δείχνουμε ψεύτικα μηδενικά) αλλά
 * σιωπηλό. Προτείνουμε ΜΟΝΟ βήματα που δεν έχει κάνει ακόμα, και η κάρτα
 * εξαφανίζεται μόλις τα κάνει· δεν είναι μόνιμο tutorial.
 */
export function EmptyDashboardHint() {
  const { t } = useTranslation();
  const goals = useLiveQuery(() => listGoals(), [], []);
  const skillProgress = useLiveQuery(() => getAllSkillProgress(), [], new Map());
  // All-time, όχι 30-μερο: αλλιώς κάποιος με ιστορικό >30 μερών ξαναβλέπει
  // «κατέγραψε την πρώτη σου προπόνηση» σαν να μην έχει προπονηθεί ποτέ.
  const hasWorkout = useLiveQuery(() => hasAnyCompletedWorkout(), [], undefined);
  const latestWeight = useLiveQuery(() => getLatestBodyweight(), [], undefined);

  if (hasWorkout === undefined || latestWeight === undefined) return null;

  // Πρώτα η προπόνηση και το βάρος — αυτά είναι το επόμενο βήμα ενός νέου
  // χρήστη. Skill και στόχος μένουν, αλλά δεν σκεπάζουν την έναρξη.
  const steps = [
    {
      done: hasWorkout,
      to: '/calendar',
      Icon: Dumbbell,
      title: t('dashboard.next.body'),
      hint: t('dashboard.next.bodyHint'),
    },
    {
      done: latestWeight != null,
      to: '/body',
      Icon: Scale,
      title: t('dashboard.next.weighIn'),
      hint: t('dashboard.next.weighInHint'),
    },
    {
      done: goals.length > 0,
      to: '/goals',
      Icon: Target,
      title: t('dashboard.next.goal'),
      hint: t('dashboard.next.goalHint'),
    },
    {
      done: skillProgress.size > 0,
      to: '/skills',
      Icon: Sparkles,
      title: t('dashboard.next.skill'),
      hint: t('dashboard.next.skillHint'),
    },
  ].filter((s) => !s.done);

  // Όλα έγιναν → η κάρτα δεν έχει λόγο ύπαρξης.
  if (steps.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-4">
      <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('dashboard.next.title')}
      </h2>
      <ul className="space-y-2">
        {steps.map(({ to, Icon, title, hint }) => (
          <li key={to}>
            <Link
              to={to}
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 ring-offset-background transition-all duration-150 hover:bg-elevated active:bg-elevated/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <Icon className="h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{title}</span>
                <span className="block text-xs text-muted-foreground">{hint}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
