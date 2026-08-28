import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { getCalendar, listActivities, localDay, startWorkout } from '@/lib/db/queries';
import type { DayActivities } from '@/lib/db/queries';
import { formatHMS } from '@/hooks/useSessionTimer';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight } from '@/lib/units';
import { ActivityChip } from '@/components/ActivityChip';
import { BottomSheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

/**
 * Τα χρώματα/σύμβολα ΔΕΝ είναι πια hardcoded — έρχονται από τον πίνακα
 * `activities`, ώστε ένα δικό σου άθλημα να εμφανίζεται εδώ σωστά χωρίς
 * να αγγίξει κανείς κώδικα.
 */
const FALLBACK_DOT = 'bg-zinc-400';

function monthBounds(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return { first, last };
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const today = localDay();
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(today);
  const [addOpen, setAddOpen] = useState(false);
  const navigate = useNavigate();

  const activities = useLiveQuery(() => listActivities(true), [], []);
  const activeActivities = activities.filter((a) => !a.is_archived);

  // Προσθήκη προπόνησης στην επιλεγμένη μέρα (σήμερα = live, παλιά = backdated).
  const onAddOnDay = async (activityKey: string) => {
    if (!selected) return;
    await startWorkout(activityKey, selected === today ? undefined : selected);
    setAddOpen(false);
    navigate('/workout');
  };
  const dotOf = (kind: string) =>
    activities.find((a) => a.key === kind)?.dot_class ?? FALLBACK_DOT;
  const labelOf = (kind: string) =>
    activities.find((a) => a.key === kind)?.label ?? kind;

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

  // Σύνοψη ορατού μήνα — δίνει νόημα σε άδεια/γεμάτη σελίδα χωρίς να ανοίξεις μέρα.
  const monthStats = useMemo(() => {
    let workouts = 0;
    const kinds = new Set<string>();
    const days = new Set<string>();
    for (const [key, d] of cal) {
      if (!key.startsWith(`${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`)) continue;
      for (const w of d.workouts) {
        workouts += 1;
        kinds.add(w.kind);
        days.add(key);
      }
    }
    return { workouts, kinds: kinds.size, days: days.size };
  }, [cal, cursor.year, cursor.month]);

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-semibold tracking-tight capitalize">
            {monthLabel}
          </h1>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {monthStats.workouts > 0
              ? [
                  t('calendar.monthWorkouts', { count: monthStats.workouts }),
                  monthStats.days > 1 ? t('calendar.monthDays', { count: monthStats.days }) : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : t('calendar.monthEmpty')}
          </p>
        </div>
        {/*
          Ένα ενιαίο σύνολο πλοήγησης. Πριν, ένας σύνδεσμος «Σώμα» ήταν
          σφηνωμένος ανάμεσα στα βελάκια — άσχετη σελίδα σε θέση ελέγχου
          μήνα· ζει πλέον στο «Περισσότερα». Τα βελάκια ήταν χαρακτήρες
          «←/→» σε κουτάκια· τώρα εικονίδια, ίδιου βάρους με τα υπόλοιπα.
        */}
        <div className="flex shrink-0 items-center rounded-lg bg-card">
          <button
            onClick={() => shift(-1)}
            aria-label={t('calendar.prev')}
            className="rounded-l-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button
            onClick={() => {
              const d = new Date();
              setCursor({ year: d.getFullYear(), month: d.getMonth() });
              setSelected(today);
            }}
            className="border-x border-border/70 px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
          >
            {t('calendar.today')}
          </button>
          <button
            onClick={() => shift(1)}
            aria-label={t('calendar.next')}
            className="rounded-r-lg px-2.5 py-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="rounded-lg bg-card p-3">
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
                  'flex min-h-[56px] flex-col items-center gap-1 rounded-lg p-1 transition-colors',
                  // Βάθος αντί για χρωματιστό περίγραμμα: επιλεγμένη = ανυψωμένη
                  // επιφάνεια, σήμερα = accent ring — τα δύο συνδυάζονται όταν
                  // η επιλεγμένη μέρα ΕΙΝΑΙ σήμερα.
                  selected === c.key ? 'bg-elevated' : 'hover:bg-muted/40',
                  c.key === today && 'ring-1 ring-inset ring-primary',
                )}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full text-xs tabular-nums',
                    c.key === today
                      ? 'bg-primary font-semibold text-primary-foreground'
                      : 'text-muted-foreground',
                  )}
                >
                  {c.day}
                </span>
                {/* μία κουκκίδα ανά δραστηριότητα — 3 αθλήματα = 3 κουκκίδες */}
                <span className="flex flex-wrap justify-center gap-0.5">
                  {(cal.get(c.key)?.workouts ?? []).slice(0, 4).map((w) => (
                    <span
                      key={w.id}
                      className={cn('h-1.5 w-1.5 rounded-full', dotOf(w.kind))}
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
      <section className="rounded-lg bg-card p-4">
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
            {/* Κάθε προπόνηση ανοίγει — πριν ήταν αδιέξοδο: έβλεπες ότι κάτι
                έγινε εκείνη τη μέρα αλλά όχι ΤΙ. */}
            {day.workouts.map((w) => (
              <li key={w.id}>
                <Link
                  to={`/history/${w.id}`}
                  className="flex items-center gap-3 rounded-md bg-muted/40 px-3 py-2 transition-colors hover:bg-muted"
                >
                  <span className={cn('h-2 w-2 shrink-0 rounded-full', dotOf(w.kind))} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{w.label ?? labelOf(w.kind)}</p>
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
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {day?.weight != null && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {t('body.weight')}: {formatWeight(day.weight, unit, { granularity: 'body' })}
          </p>
        )}

        {selected && (
          <button
            onClick={() => setAddOpen(true)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" />
            {t('calendar.addWorkout')}
          </button>
        )}
      </section>

      {/* Επιλογή δραστηριότητας → φτιάχνει προπόνηση στην επιλεγμένη μέρα */}
      <BottomSheet open={addOpen} onClose={() => setAddOpen(false)} title={t('calendar.addWorkout')}>
        {/* Ίδια γλώσσα με το ημερολόγιο: το χρώμα ΕΙΝΑΙ η δραστηριότητα. */}
        <div className="flex flex-wrap gap-2 px-4 pb-4">
          {activeActivities.map((a) => (
            <ActivityChip key={a.key} activity={a} onClick={() => void onAddOnDay(a.key)} />
          ))}
        </div>
      </BottomSheet>
    </div>
  );
}
