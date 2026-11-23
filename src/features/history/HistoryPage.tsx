import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { useWindowVirtualizer } from '@tanstack/react-virtual';
import { CalendarPlus, Clock, Dumbbell, Layers, Search, Trophy, X } from 'lucide-react';
import { formatHMS } from '@/hooks/useSessionTimer';
import {
  getRecentPRs,
  listActivities,
  listAllExercises,
  listWorkoutSummaries,
  type WorkoutSummary,
} from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight } from '@/lib/units';
import { SectionTitle } from '@/components/ui/Section';
import { Input } from '@/components/ui/input';
import { VolumeChart } from './components/VolumeChart';
import { FeelChart } from './components/FeelChart';
import { ProgressHistoryTabs } from './components/ProgressHistoryTabs';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import { WEIGHT_PR_TYPES } from '@/lib/domain/pr';

const VIRTUALIZE_THRESHOLD = 50;

type GroupMode = 'month' | 'week';

type HistoryRow =
  | { type: 'group'; key: string; label: string; count: number; volume: number }
  | { type: 'workout'; summary: WorkoutSummary };

/** Δευτέρα της εβδομάδας μιας τοπικής ημέρας YYYY-MM-DD. */
function weekStartOf(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  const offset = (date.getDay() + 6) % 7; // 0 = Δευτέρα
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset);
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(
    monday.getDate(),
  ).padStart(2, '0')}`;
}

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';

  const completed = useLiveQuery(() => listWorkoutSummaries(), []);
  const list = useMemo(() => completed ?? [], [completed]);

  // ── Φίλτρα: ελεύθερο κείμενο, άσκηση, εύρος ημερομηνιών ──
  const [query, setQuery] = useState('');
  const [exerciseFilter, setExerciseFilter] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [groupMode, setGroupMode] = useState<GroupMode>('month');

  const activityLabels = useLiveQuery(
    async () => new Map((await listActivities(true)).map((a) => [a.key, a.label])),
    [],
    new Map<string, string>(),
  );
  const exerciseOptions = useLiveQuery(
    async () => (await listAllExercises()).map((e) => ({ id: e.id, name: e.name })),
    [],
    [] as Array<{ id: string; name: string }>,
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const labelOf = (s: WorkoutSummary) =>
      (s.workout.workout_type ?? activityLabels.get(s.workout.activity_kind) ?? s.workout.activity_kind).toLowerCase();
    return list.filter((s) => {
      const day = s.workout.started_at.slice(0, 10);
      if (fromDate && day < fromDate) return false;
      if (toDate && day > toDate) return false;
      if (exerciseFilter && !s.exerciseIds.includes(exerciseFilter)) return false;
      if (q && !labelOf(s).includes(q) && !(s.topExercise ?? '').toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [list, query, exerciseFilter, fromDate, toDate, activityLabels]);

  // Ομαδοποίηση ανά μήνα ή εβδομάδα, με σύνοψη (πλήθος + όγκος) ανά ομάδα.
  const groups = useMemo(() => {
    const map = new Map<string, WorkoutSummary[]>();
    for (const s of filtered) {
      const key =
        groupMode === 'month'
          ? s.workout.started_at.slice(0, 7)
          : weekStartOf(s.workout.started_at.slice(0, 10));
      const arr = map.get(key) ?? [];
      arr.push(s);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [filtered, groupMode]);
  const groupLabel = (key: string): string =>
    groupMode === 'month'
      ? new Date(`${key}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
      : `${t('history.groupWeek')} · ${new Date(`${key}T12:00:00`).toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
        })}`;
  const historyRows = useMemo<HistoryRow[]>(
    () =>
      groups.flatMap(([key, items]) => [
        {
          type: 'group' as const,
          key,
          label: groupMode === 'month'
            ? new Date(`${key}-01T12:00:00`).toLocaleDateString(locale, { month: 'long', year: 'numeric' })
            : new Date(`${key}T12:00:00`).toLocaleDateString(locale, { day: 'numeric', month: 'short' }),
          count: items.length,
          volume: items.reduce((a, s) => a + s.volume, 0),
        },
        ...items.map((summary) => ({ type: 'workout' as const, summary })),
      ]),
    [groups, groupMode, locale],
  );
  const virtualized = filtered.length > VIRTUALIZE_THRESHOLD;
  const virtualListRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);
  useLayoutEffect(() => {
    if (!virtualized) return;
    const el = virtualListRef.current;
    if (!el) return;
    const update = () => setScrollMargin(el.offsetTop);
    update();
    window.addEventListener('resize', update);
    // Το περιεχόμενο πάνω από τη λίστα (VolumeChart/FeelChart/PRs) φορτώνει async
    // και αλλάζει το offsetTop χωρίς resize ή αλλαγή πλήθους γραμμών· χωρίς αυτό
    // ο window virtualizer κρατά stale margin → κενά/clipping σε 50+ items.
    const ro = new ResizeObserver(update);
    ro.observe(document.body);
    return () => {
      window.removeEventListener('resize', update);
      ro.disconnect();
    };
  }, [virtualized, historyRows.length]);
  const rowVirtualizer = useWindowVirtualizer({
    count: virtualized ? historyRows.length : 0,
    estimateSize: (index) => historyRows[index]?.type === 'group' ? 52 : 104,
    overscan: 6,
    scrollMargin,
  });

  const prs = useLiveQuery(() => getRecentPRs(8), [], []);
  // listAllExercises (όχι db.exercises.toArray()): οι δικές σου ασκήσεις
  // δεν πρέπει να διαρρέουν στο ιστορικό άλλου προφίλ. Παίρνουμε ΚΑΙ τις
  // αρχειοθετημένες γιατί ένα PR μπορεί να αναφέρεται σε άσκηση που έκτοτε
  // αρχειοθέτησες.
  const exerciseNames = useLiveQuery(
    async () => new Map((await listAllExercises()).map((e) => [e.id, e.name])),
    [],
    new Map<string, string>(),
  );
  const loading = completed === undefined;
  const uniquePrs = useMemo(() => {
    const seen = new Set<string>();
    return prs.filter((pr) => {
      const key = pr.exercise_id ?? (pr.activity_kind ? `activity:${pr.activity_kind}` : pr.id);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [prs]);

  if (loading) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('history.title')}</h1>
        </header>
        <ProgressHistoryTabs />
        <HistorySkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('history.title')}
        </h1>
        {list.length > 0 && (
          <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
            {t('history.completedCount', { count: list.length })}
          </p>
        )}
      </header>

      <ProgressHistoryTabs />

      <VolumeChart />
      <FeelChart />

      {list.length > 0 && (
        <section className="space-y-2" aria-label={t('history.filtersLabel')}>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              aria-label={t('history.searchPlaceholder')}
              className="h-10 pl-9"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={exerciseFilter}
              onChange={(e) => setExerciseFilter(e.target.value)}
              aria-label={t('history.filterByExercise')}
              className="h-9 min-w-0 flex-1 rounded-md border border-input bg-background px-2 tap:h-11 text-xs text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('history.filterByExercise')}</option>
              {exerciseOptions.map((ex) => (
                <option key={ex.id} value={ex.id}>
                  {ex.name}
                </option>
              ))}
            </select>
            <div role="group" aria-label={t('history.groupBy')} className="flex rounded-md bg-elevated p-0.5 text-xs font-medium">
              <button
                type="button"
                aria-pressed={groupMode === 'month'}
                onClick={() => setGroupMode('month')}
                className={cn(
                  'rounded px-2.5 py-1 transition-colors tap:min-h-11',
                  groupMode === 'month' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {t('history.groupMonth')}
              </button>
              <button
                type="button"
                aria-pressed={groupMode === 'week'}
                onClick={() => setGroupMode('week')}
                className={cn(
                  'rounded px-2.5 py-1 transition-colors tap:min-h-11',
                  groupMode === 'week' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
                )}
              >
                {t('history.groupWeek')}
              </button>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              {t('history.filterDateFrom')}
              <input
                type="date"
                value={fromDate}
                max={toDate || undefined}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 tap:h-11 font-mono text-xs tabular-nums"
              />
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              {t('history.filterDateTo')}
              <input
                type="date"
                value={toDate}
                min={fromDate || undefined}
                onChange={(e) => setToDate(e.target.value)}
                className="h-9 rounded-md border border-input bg-background px-2 tap:h-11 font-mono text-xs tabular-nums"
              />
            </label>
            {(query || exerciseFilter || fromDate || toDate) && (
              <button
                type="button"
                onClick={() => {
                  setQuery('');
                  setExerciseFilter('');
                  setFromDate('');
                  setToDate('');
                }}
                className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground tap:min-h-11"
              >
                <X className="h-3 w-3" aria-hidden />
                {t('history.clearFilters')}
              </button>
            )}
          </div>
        </section>
      )}

      {uniquePrs.length > 0 && (
        <section>
          <SectionTitle>{t('history.recentPRs')}</SectionTitle>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
            {uniquePrs.map((pr) => (
              <li key={pr.id} className="flex min-h-[3rem] items-center gap-3 px-4 py-2.5">
                <Trophy className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {pr.exercise_id
                      ? (exerciseNames.get(pr.exercise_id) ?? '—')
                      : pr.activity_kind
                        ? (activityLabels.get(pr.activity_kind) ?? pr.activity_kind)
                        : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`history.pr.${pr.type}`)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm tabular-nums">
                    {WEIGHT_PR_TYPES.has(pr.type)
                      ? formatWeight(pr.value, unit)
                      : Math.round(pr.value * 10) / 10}
                  </p>
                  <p className="font-mono text-xs tabular-nums text-muted-foreground">
                    {new Date(pr.achieved_at).toLocaleDateString(locale)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-10 text-center">
          <Dumbbell className="h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
          <Link
            to="/calendar"
            className="mt-1 flex h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            {t('history.logFirst')}
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p className="rounded-xl bg-card px-6 py-8 text-center text-sm text-muted-foreground">
          {t('history.noResults')}
        </p>
      ) : virtualized ? (
        <div
          ref={virtualListRef}
          className="relative"
          style={{ height: rowVirtualizer.getTotalSize() }}
          role="list"
          aria-label={t('history.title')}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const row = historyRows[virtualRow.index];
            if (!row) return null;
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                className="absolute left-0 top-0 w-full"
                style={{ transform: `translateY(${virtualRow.start - scrollMargin}px)` }}
              >
                {row.type === 'group' ? (
                  <GroupHeader label={row.label} count={row.count} volume={row.volume} unit={unit} t={t} />
                ) : (
                  <div className="pb-2" role="listitem">
                    <WorkoutHistoryCard
                      summary={row.summary}
                      locale={locale}
                      unit={unit}
                      activity={activityLabels.get(row.summary.workout.activity_kind) ?? row.summary.workout.activity_kind}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([key, items]) => (
            <section key={key}>
              <GroupHeader
                label={groupLabel(key)}
                count={items.length}
                volume={items.reduce((a, s) => a + s.volume, 0)}
                unit={unit}
                t={t}
              />
              <ul className="stagger space-y-2">
                {items.map((summary) => (
                  <li key={summary.workout.id}>
                    <WorkoutHistoryCard
                      summary={summary}
                      locale={locale}
                      unit={unit}
                      activity={activityLabels.get(summary.workout.activity_kind) ?? summary.workout.activity_kind}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function GroupHeader({
  label,
  count,
  volume,
  unit,
  t,
}: {
  label: string;
  count: number;
  volume: number;
  unit: 'kg' | 'lb';
  t: (key: string, opts?: Record<string, unknown>) => string;
}) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-2 px-1 pt-5 first:pt-0">
      <h2 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </h2>
      <span className="font-mono text-xs tabular-nums text-muted-foreground">
        {t('history.rangeSummary', {
          count,
          volume: volume > 0 ? formatWeight(volume, unit, { granularity: 'plate' }) : '—',
        })}
      </span>
    </div>
  );
}

function WorkoutHistoryCard({
  summary: { workout: w, setCount, volume, topExercise },
  locale,
  unit,
  activity,
}: {
  summary: WorkoutSummary;
  locale: string | undefined;
  unit: 'kg' | 'lb';
  activity: string;
}) {
  const hasMeta = setCount > 0 || volume > 0 || w.duration_seconds != null;
  return (
    <Link
      to={`/history/${w.id}`}
      className="block rounded-xl bg-card px-4 py-3 transition-colors hover:bg-elevated active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="flex items-baseline justify-between gap-2">
        <p className="truncate text-sm font-medium">{w.workout_type ?? activity}</p>
        <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
          {new Date(w.started_at).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}
        </span>
      </div>
      {hasMeta && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
          {setCount > 0 && (
            <span className="flex items-center gap-1">
              <Layers className="h-3 w-3" aria-hidden />
              {setCount}
            </span>
          )}
          {volume > 0 && <span>{formatWeight(volume, unit)}</span>}
          {w.duration_seconds ? (
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {formatHMS(w.duration_seconds)}
            </span>
          ) : null}
        </div>
      )}
      {topExercise && (
        <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
          <Dumbbell className="h-3 w-3 shrink-0" aria-hidden />
          {topExercise}
        </p>
      )}
    </Link>
  );
}


function HistorySkeleton() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" role="status" aria-label={t('common.loading')}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[5.5rem] animate-pulse rounded-xl bg-card" aria-hidden />
      ))}
    </div>
  );
}
