import { lazy, Suspense, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  getActivityPRs,
  getActivityProgress,
  listActivities,
} from '@/lib/db/queries';
import { cn } from '@/lib/utils';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector';
import {
  CHART_RANGE_DAYS,
  type ChartRangeKey,
} from '@/components/charts/timeRange';

const ActivityProgressBody = lazy(() => import('./ActivityProgress.body'));

type ActMetric = 'distanceKm' | 'paceSecPerKm';

function fmtPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Πρόοδος δραστηριοτήτων χωρίς σετ (τρέξιμο/ποδήλατο/κολύμβηση). Δίνει στους
 * δρομείς/κολυμβητές το ΙΔΙΟ εργαλείο chart/PR που έχουν οι lifters — «από
 * απλούς ανθρώπους μέχρι πρωταθλητές». Ο ρυθμός σχεδιάζεται ανεστραμμένος
 * νοητά: μικρότερος = καλύτερος.
 */
export function ActivityProgress() {
  const { t } = useTranslation();
  const [activityKey, setActivityKey] = useState<string | null>(null);
  const [metric, setMetric] = useState<ActMetric>('distanceKm');
  const [range, setRange] = useState<ChartRangeKey>('3M');

  // Μόνο δραστηριότητες που ΔΕΝ καταγράφουν σετ — οι υπόλοιπες είναι στο tab ασκήσεων.
  const activities = useLiveQuery(
    () => listActivities().then((all) => all.filter((a) => !a.uses_sets)),
    [],
    [],
  );
  const rangeDays = CHART_RANGE_DAYS[range];
  const points = useLiveQuery(
    () => (activityKey ? getActivityProgress(activityKey, rangeDays) : Promise.resolve([])),
    [activityKey, rangeDays],
    [],
  );
  const prs = useLiveQuery(
    () => (activityKey ? getActivityPRs(activityKey) : Promise.resolve(new Map())),
    [activityKey],
    new Map(),
  );

  const selected = activities.find((a) => a.key === activityKey) ?? null;
  const withData = points.filter((p) => p[metric] != null);

  if (activities.length === 0) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('progress.activities')}
      </h2>

      {!activityKey ? (
        <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
          {activities.map((a) => (
            <li key={a.key}>
              <button
                onClick={() => {
                  setActivityKey(a.key);
                  setMetric(a.tracks_distance ? 'distanceKm' : 'paceSecPerKm');
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-elevated active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <span aria-hidden>{a.icon}</span>
                <span className="flex-1 truncate text-sm font-medium">{a.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <div className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-lg font-medium">
              {selected?.icon} {selected?.label}
            </h3>
            <button
              onClick={() => setActivityKey(null)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t('progress.change')}
            </button>
          </div>

          {/* PR περίληψη — χρυσό ΜΟΝΟ εδώ, είναι επίτευξη */}
          <div className="flex flex-wrap gap-2 text-xs">
            {prs.get('longest_distance') && (
              <span className="rounded-full bg-gold/10 px-2.5 py-1 text-gold">
                ★ {t('progress.longestDistance')}:{' '}
                <span className="font-mono tabular-nums">{prs.get('longest_distance')!.value} km</span>
              </span>
            )}
            {prs.get('fastest_pace') && (
              <span className="rounded-full bg-gold/10 px-2.5 py-1 text-gold">
                ★ {t('progress.fastestPace')}:{' '}
                <span className="font-mono tabular-nums">{fmtPace(prs.get('fastest_pace')!.value)}/km</span>
              </span>
            )}
            {prs.get('longest_duration') && (
              <span className="rounded-full bg-gold/10 px-2.5 py-1 text-gold">
                ★ <span className="font-mono tabular-nums">{Math.round(prs.get('longest_duration')!.value / 60)} min</span>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            {selected?.tracks_distance ? (
              <div className="flex gap-1">
                {(['distanceKm', 'paceSecPerKm'] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setMetric(m)}
                    className={cn(
                      'rounded-md border border-border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                      metric === m
                        ? 'border-primary/40 bg-primary text-primary-foreground shadow-glow-sm'
                        : 'hover:bg-elevated',
                    )}
                  >
                    {t(m === 'distanceKm' ? 'progress.distance' : 'progress.pace')}
                  </button>
                ))}
              </div>
            ) : (
              <span />
            )}
            <TimeRangeSelector value={range} onChange={setRange} />
          </div>

          {withData.length < 2 ? (
            <div className="rounded-xl bg-card p-6 text-center text-sm text-muted-foreground">
              {t('progress.needMore')}
            </div>
          ) : (
            <div className="rounded-xl bg-card p-4">
              <div className="h-48 w-full">
                <Suspense fallback={<ChartSkeleton />}>
                  <ActivityProgressBody
                    withData={withData as unknown as Array<Record<string, unknown>>}
                    metric={metric}
                    range={range}
                  />
                </Suspense>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
