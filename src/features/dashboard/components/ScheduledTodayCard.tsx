import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarClock } from 'lucide-react';
import { listScheduledForDay } from '@/lib/db/scheduledSessions';
import { localDay } from '@/lib/db/queries';
import { SectionTitle } from '@/components/ui/Section';

/**
 * «Σήμερα στο πρόγραμμα» — η μόνη κάρτα της Αρχής που δείχνει κάτι που ΔΕΝ
 * έχει γίνει ακόμη. Επιστρέφει null όταν δεν υπάρχει planned session σήμερα,
 * ώστε να μην εμφανίζεται κενό/ψεύτικο κουτί.
 */
export function ScheduledTodayCard() {
  const { t } = useTranslation();
  const today = localDay();
  const sessions = useLiveQuery(() => listScheduledForDay(today), [today], []);
  const planned = sessions.filter((s) => s.status === 'planned');

  if (planned.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-4">
      <SectionTitle
        action={
          <Link
            to="/calendar"
            className="text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('dashboard.viewAll')} →
          </Link>
        }
      >
        {t('dashboard.scheduledToday')}
      </SectionTitle>
      <ul className="divide-y divide-border/60">
        {planned.slice(0, 3).map((session) => (
          <li key={session.id} className="flex items-center gap-2.5 py-2">
            <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{session.title}</p>
              {session.time && (
                <p className="font-mono text-xs tabular-nums text-muted-foreground">
                  {session.time}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
      {planned.length > 3 && (
        <p className="pt-1 text-xs text-muted-foreground">
          {t('dashboard.scheduledMore', { count: planned.length - 3 })}
        </p>
      )}
    </section>
  );
}
