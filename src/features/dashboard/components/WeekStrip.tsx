import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getCalendar, localDay } from '@/lib/db/queries';
import { cn } from '@/lib/utils';
import { mondayOf } from './weekMath';

/**
 * Επτά κουτάκια Δευτέρα→Κυριακή, κάτω από το hero (ARCHITECTURE-V4 §7 W-D).
 * «Σήμερα» παίρνει δακτύλιο, γεμάτη μέρα = υπήρξε προπόνηση — tap πάει στο
 * Calendar. undefined=φορτώνει (σκελετός), όχι ψεύτικο άδειο σχέδιο.
 */
export function WeekStrip() {
  const { i18n } = useTranslation();
  const today = localDay();

  const days = useMemo(() => {
    const monday = mondayOf(new Date());
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return d;
    });
  }, []);
  const fromKey = localDay(days[0]!);
  const toKey = localDay(days[6]!);
  const cal = useLiveQuery(() => getCalendar(fromKey, toKey), [fromKey, toKey], undefined);

  return (
    <div className="grid grid-cols-7 gap-1.5">
      {days.map((d) => {
        const key = localDay(d);
        const weekdayLabel = d.toLocaleDateString(i18n.resolvedLanguage, { weekday: 'narrow' });
        const fullLabel = d.toLocaleDateString(i18n.resolvedLanguage, {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        });
        const trained = cal === undefined ? undefined : (cal.get(key)?.workouts.length ?? 0) > 0;
        return (
          <Link
            key={key}
            to="/calendar"
            aria-label={fullLabel}
            className="flex flex-col items-center gap-1 rounded-lg py-1.5 ring-offset-background transition-all duration-150 hover:bg-elevated active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <span className="text-[9px] uppercase text-muted-foreground">{weekdayLabel}</span>
            {trained === undefined ? (
              <span className="h-7 w-7 animate-pulse rounded-full bg-muted/40" />
            ) : (
              <span
                className={cn(
                  'flex h-7 w-7 items-center justify-center rounded-full font-mono text-xs font-medium tabular-nums transition-colors',
                  trained ? 'bg-primary/15 text-primary' : 'text-muted-foreground',
                  key === today && 'ring-1 ring-inset ring-primary',
                )}
              >
                {d.getDate()}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}
