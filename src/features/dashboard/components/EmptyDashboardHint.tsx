import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, Sparkles, Target, Scale } from 'lucide-react';
import { getTrainingSummary } from '@/lib/db/queries';
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
  const summary30 = useLiveQuery(() => getTrainingSummary(30), [], null);
  const goals = useLiveQuery(() => listGoals(), [], []);
  const skillProgress = useLiveQuery(() => getAllSkillProgress(), [], new Map());

  if (!summary30) return null;

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
      done: summary30.totalSets > 0,
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
              className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 transition-colors duration-200 hover:bg-elevated"
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
