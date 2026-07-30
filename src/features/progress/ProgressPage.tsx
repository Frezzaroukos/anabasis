import { useState } from 'react';
import { Link } from 'react-router-dom';
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
import { getExerciseProgress, listExercises } from '@/lib/db/queries';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Metric = 'topWeight' | 'e1rm' | 'volume';

/**
 * Πρόοδος ανά άσκηση. Ο χρήστης διαλέγει ΤΙ μετρά: το καλύτερο σετ (topWeight)
 * δείχνει καθαρή δύναμη, το e1RM συγκρίνει σετ διαφορετικών επαναλήψεων, ο
 * όγκος δείχνει φόρτο. Είναι διαφορετικές ερωτήσεις, όχι διαφορετικά styles.
 */
export function ProgressPage() {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('topWeight');

  const exercises = useLiveQuery(() => listExercises(), [], []);
  const points = useLiveQuery(
    () => (exerciseId ? getExerciseProgress(exerciseId, 365) : Promise.resolve([])),
    [exerciseId],
    [],
  );

  const filtered = q
    ? exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : exercises;
  const selected = exercises.find((e) => e.id === exerciseId) ?? null;
  const withData = points.filter((p) => p[metric] != null);
  const best = withData.length
    ? Math.max(...withData.map((p) => Number(p[metric])))
    : null;

  return (
    <div className="space-y-6">
      <header>
        <Link to="/history" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t('history.title')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {t('progress.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('progress.hint')}</p>
      </header>

      {!exerciseId ? (
        <section className="space-y-3">
          <Input
            placeholder={t('workout.searchExercises')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10"
          />
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {filtered.map((e) => (
              <li key={e.id}>
                <button
                  onClick={() => setExerciseId(e.id)}
                  className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-muted/50"
                >
                  <span className="text-sm font-medium">{e.name}</span>
                  <span className="text-[10px] uppercase text-muted-foreground">
                    {e.category}
                  </span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t('progress.noMatch')}
              </li>
            )}
          </ul>
        </section>
      ) : (
        <section className="space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">{selected?.name}</h2>
            <button
              onClick={() => setExerciseId(null)}
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
            >
              {t('progress.change')}
            </button>
          </div>

          <div className="flex gap-1">
            {(['topWeight', 'e1rm', 'volume'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  'rounded-md border border-border px-3 py-1 text-xs transition-colors',
                  metric === m ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {t(`progress.${m}`)}
              </button>
            ))}
          </div>

          {withData.length < 2 ? (
            <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
              {t('progress.needMore')}
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                <span>
                  {withData.length} {t('progress.sessions')}
                </span>
                {best != null && (
                  <span className="font-mono">
                    {t('progress.best')}: {Math.round(best * 10) / 10}
                  </span>
                )}
              </div>
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
                      domain={['dataMin - 2', 'dataMax + 2']}
                      tick={{ fontSize: 10 }}
                      stroke="currentColor"
                      className="text-muted-foreground"
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                      formatter={(v: number) => [v, t(`progress.${metric}`)]}
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
        </section>
      )}
    </div>
  );
}
