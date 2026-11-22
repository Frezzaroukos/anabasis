import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowRight, CalendarClock, Play } from 'lucide-react';
import { listScheduledForDay, startScheduledSession } from '@/lib/db/scheduledSessions';
import type { ScheduledSession } from '@/lib/db/types';
import { localDay } from '@/lib/db/queries';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { SectionTitle } from '@/components/ui/Section';
import { scheduledRowAction } from './scheduledTodayLogic';

/**
 * «Σήμερα στο πρόγραμμα» — η μόνη κάρτα της Αρχής που δείχνει κάτι που ΔΕΝ
 * έχει γίνει ακόμη. Κάθε planned row έχει Start (ίδια ροή με το calendar
 * sheet: `startScheduledSession` → linked workout → /workout/active). Αν
 * υπάρχει ήδη ενεργή προπόνηση, το ίδιο κουμπί γίνεται «Συνέχεια» αντί να
 * προσπαθήσει (και να αποτύχει) δεύτερο start.
 *
 * Επιστρέφει null όταν δεν υπάρχει planned session σήμερα, ώστε να μην
 * εμφανίζεται κενό/ψεύτικο κουτί.
 */
export function ScheduledTodayCard({ hideSingle = false }: { hideSingle?: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const today = localDay();
  const sessions = useLiveQuery(() => listScheduledForDay(today), [today], []);
  const active = useActiveWorkout();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const planned = sessions.filter((s) => s.status === 'planned');
  if (planned.length === 0) return null;
  if (hideSingle && planned.length === 1) return null;

  const start = async (session: ScheduledSession) => {
    if (busyId) return;
    setBusyId(session.id);
    setError(null);
    try {
      const result = await startScheduledSession(session);
      if (!result) {
        setError(t('dashboard.scheduledStartError'));
        return;
      }
      navigate('/workout/active');
    } finally {
      setBusyId(null);
    }
  };

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
        {planned.slice(0, 3).map((session) => {
          const action = scheduledRowAction(session, active);
          const isContinue = action === 'continue';
          return (
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
              {action !== 'loading' && (
                <button
                  type="button"
                  onClick={() => (isContinue ? navigate('/workout/active') : void start(session))}
                  disabled={busyId === session.id}
                  aria-label={
                    isContinue
                      ? t('dashboard.continueScheduled', { title: session.title })
                      : t('dashboard.startScheduled', { title: session.title })
                  }
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-opacity hover:opacity-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
                >
                  {isContinue ? (
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  ) : (
                    <Play className="h-3.5 w-3.5" aria-hidden />
                  )}
                  {isContinue ? t('dashboard.continue') : t('dashboard.start')}
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {error && (
        <p className="pt-1 text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
      {planned.length > 3 && (
        <p className="pt-1 text-xs text-muted-foreground">
          {t('dashboard.scheduledMore', { count: planned.length - 3 })}
        </p>
      )}
    </section>
  );
}
