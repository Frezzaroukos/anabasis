import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Sparkles, Target, Scale } from 'lucide-react';
import { hasAnyCompletedWorkout } from '@/lib/db/queries';
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

  if (hasWorkout === undefined) return null;

  const steps = [
    {
      done: skillProgress.size > 0,
      to: '/skills',
      Icon: Sparkles,
      title: t('dashboard.next.skill'),
      hint: t('dashboard.next.skillHint'),
    },
    {
      done: goals.length > 0,
      to: '/goals',
      Icon: Target,
      title: t('dashboard.next.goal'),
      hint: t('dashboard.next.goalHint'),
    },
    {
      done: hasWorkout,
      to: '/body',
      Icon: Scale,
      title: t('dashboard.next.body'),
      hint: t('dashboard.next.bodyHint'),
    },
  ].filter((s) => !s.done);

  // Όλα έγιναν → η κάρτα δεν έχει λόγο ύπαρξης.
  if (steps.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('dashboard.next.title')}
      </h2>
      <ul className="space-y-2">
        {steps.map(({ to, Icon, title, hint }) => (
          <li key={to}>
            <Link
              to={to}
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 ring-offset-background transition-all duration-150 hover:bg-elevated active:bg-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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
