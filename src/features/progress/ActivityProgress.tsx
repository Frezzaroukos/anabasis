import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  getActivityPRs,
  getActivityProgress,
  listActivities,
} from '@/lib/db/queries';
import { cn } from '@/lib/utils';

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

  // Μόνο δραστηριότητες που ΔΕΝ καταγράφουν σετ — οι υπόλοιπες είναι στο tab ασκήσεων.
  const activities = useLiveQuery(
    () => listActivities().then((all) => all.filter((a) => !a.uses_sets)),
    [],
    [],
  );
  const points = useLiveQuery(
    () => (activityKey ? getActivityProgress(activityKey, 365) : Promise.resolve([])),
    [activityKey],
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
      <h2 className="text-sm font-medium text-muted-foreground">
        {t('progress.activities')}
      </h2>

      {!activityKey ? (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {activities.map((a) => (
            <li key={a.key}>
              <button
                onClick={() => {
                  setActivityKey(a.key);
                  setMetric(a.tracks_distance ? 'distanceKm' : 'paceSecPerKm');
                }}
                className="flex w-full items-center gap-2 px-4 py-3 text-left transition-colors hover:bg-muted/50"
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

          {/* PR περίληψη */}
          <div className="flex flex-wrap gap-2 text-xs">
            {prs.get('longest_distance') && (
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-500">
                ★ {t('progress.longestDistance')}: {prs.get('longest_distance')!.value} km
              </span>
            )}
            {prs.get('fastest_pace') && (
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-500">
                ★ {t('progress.fastestPace')}: {fmtPace(prs.get('fastest_pace')!.value)}/km
              </span>
            )}
            {prs.get('longest_duration') && (
              <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-amber-500">
                ★ {Math.round(prs.get('longest_duration')!.value / 60)} min
              </span>
            )}
          </div>

          {selected?.tracks_distance && (
            <div className="flex gap-1">
              {(['distanceKm', 'paceSecPerKm'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMetric(m)}
                  className={cn(
                    'rounded-md border border-border px-3 py-1 text-xs transition-colors',
                    metric === m ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  {t(m === 'distanceKm' ? 'progress.distance' : 'progress.pace')}
                </button>
              ))}
            </div>
          )}

          {withData.length < 2 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t('progress.needMore')}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={withData} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="currentColor"
                      className="text-border"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(5)}
                      tick={{ fontSize: 10 }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                    />
                    <YAxis
                      domain={['dataMin', 'dataMax']}
                      reversed={metric === 'paceSecPerKm'}
                      tick={{ fontSize: 10 }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                      tickFormatter={(v: number) =>
                        metric === 'paceSecPerKm' ? fmtPace(v) : String(Math.round(v * 10) / 10)
                      }
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                      formatter={(v: number) => [
                        metric === 'paceSecPerKm' ? `${fmtPace(v)}/km` : `${v} km`,
                        t(metric === 'paceSecPerKm' ? 'progress.pace' : 'progress.distance'),
                      ]}
                    />
                    <Line
                      type="monotone"
                      dataKey={metric}
                      stroke="currentColor"
                      className="text-primary"
                      strokeWidth={2}
                      dot={{ r: 2 }}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
