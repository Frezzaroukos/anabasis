import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getCalendar, localDay } from '@/lib/db/queries';
import type { DayActivities } from '@/lib/db/queries';
import type { ActivityKind } from '@/lib/db/types';
import { formatHMS } from '@/hooks/useSessionTimer';
import { cn } from '@/lib/utils';

/** Χρώμα + σύμβολο ανά δραστηριότητα — ώστε μια μέρα με 3 αθλήματα να διαβάζεται με μια ματιά. */
const KIND_STYLE: Record<ActivityKind, { dot: string; icon: string }> = {
  strength: { dot: 'bg-sky-400', icon: '⬛' },
  skill: { dot: 'bg-violet-400', icon: '◆' },
  run: { dot: 'bg-emerald-400', icon: '▲' },
  basketball: { dot: 'bg-amber-400', icon: '●' },
  cycling: { dot: 'bg-cyan-400', icon: '◇' },
  swim: { dot: 'bg-blue-400', icon: '≈' },
  mobility: { dot: 'bg-rose-400', icon: '◡' },
  other: { dot: 'bg-zinc-400', icon: '·' },
};

function monthBounds(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return { first, last };
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const today = localDay();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(today);

  const { first, last } = monthBounds(cursor.year, cursor.month);
  const fromKey = localDay(first);
  const toKey = localDay(last);

  const cal = useLiveQuery(
    () => getCalendar(fromKey, toKey),
    [fromKey, toKey],
    new Map<string, DayActivities>(),
  );

  // Πλέγμα: ξεκινά Δευτέρα (ευρωπαϊκή εβδομάδα)
  const cells = useMemo(() => {
    const lead = (first.getDay() + 6) % 7;
    const out: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(cursor.year, cursor.month, d);
      out.push({ key: localDay(date), day: d });
    }
    return out;
  }, [cursor.year, cursor.month, first, last]);

  const monthLabel = first.toLocaleDateString(i18n.resolvedLanguage, {
    month: 'long',
    year: 'numeric',
  });
  const weekdays = useMemo(() => {
    // Δευτέρα-πρώτα ονόματα ημερών από τη locale
    const base = new Date(2024, 0, 1); // Δευτέρα
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(i18n.resolvedLanguage, { weekday: 'short' });
    });
  }, [i18n.resolvedLanguage]);

  const shift = (delta: number) =>
    setCursor(({ year, month }) => {
      const m = month + delta;
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });

  const day = selected ? cal.get(selected) : undefined;

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold tracking-tight capitalize">
          {monthLabel}
        </h1>
        <div className="flex gap-1">
          <Link
            to="/body"
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
          >
            {t('body.title')}
          </Link>
          <button
            onClick={() => shift(-1)}
            aria-label={t('calendar.prev')}
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
          >
            ←
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setCursor({ year: d.getFullYear(), month: d.getMonth() });
              setSelected(today);
            }}
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
          >
            {t('calendar.today')}
          </button>
          <button
            onClick={() => shift(1)}
            aria-label={t('calendar.next')}
            className="rounded-md border border-border px-3 py-1 text-sm hover:bg-accent"
          >
            →
          </button>
        </div>
      </header>

      <div className="rounded-lg border border-border bg-card p-3">
        <div className="mb-1 grid grid-cols-7 gap-1">
          {weekdays.map((w) => (
            <div
              key={w}
              className="py-1 text-center text-[10px] uppercase text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) =>
            c === null ? (
              <div key={`pad-${i}`} />
            ) : (
              <button
                key={c.key}
                onClick={() => setSelected(c.key)}
                className={cn(
                  'flex min-h-[54px] flex-col items-center gap-1 rounded-md border p-1 transition-colors',
                  c.key === today ? 'border-primary' : 'border-transparent',
                  selected === c.key ? 'bg-accent' : 'hover:bg-muted/50',
                )}
              >
                <span
                  className={cn(
                    'text-xs',
                    c.key === today ? 'font-semibold' : 'text-muted-foreground',
                  )}
                >
                  {c.day}
                </span>
                {/* μία κουκκίδα ανά δραστηριότητα — 3 αθλήματα = 3 κουκκίδες */}
                <span className="flex flex-wrap justify-center gap-0.5">
                  {(cal.get(c.key)?.workouts ?? []).slice(0, 4).map((w) => (
                    <span
                      key={w.id}
                      className={cn('h-1.5 w-1.5 rounded-full', KIND_STYLE[w.kind].dot)}
                    />
                  ))}
                </span>
                {cal.get(c.key)?.weight != null && (
                  <span className="font-mono text-[9px] text-muted-foreground">
                    {cal.get(c.key)!.weight}
                  </span>
                )}
              </button>
            ),
          )}
        </div>
      </div>

      {/* Λεπτομέρειες επιλεγμένης ημέρας */}
      <section className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">
          {selected
            ? new Date(selected).toLocaleDateString(i18n.resolvedLanguage, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })
            : t('calendar.pickDay')}
        </h2>
        {!day || day.workouts.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('calendar.noActivity')}</p>
        ) : (
          <ul className="space-y-2">
            {day.workouts.map((w) => (
              <li
                key={w.id}
                className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2"
              >
                <span
                  className={cn('h-2 w-2 shrink-0 rounded-full', KIND_STYLE[w.kind].dot)}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {w.label ?? t(`activity.${w.kind}`)}
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {[
                      w.durationSeconds ? formatHMS(w.durationSeconds) : null,
                      w.sets ? `${w.sets} ${t('history.totalSets')}` : null,
                      w.distanceKm ? `${w.distanceKm} km` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ') || '—'}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {day?.weight != null && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {t('body.weight')}: {day.weight} kg
          </p>
        )}
      </section>
    </div>
  );
}
