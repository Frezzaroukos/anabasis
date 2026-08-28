import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  exportExerciseCsv,
  getExerciseProgress,
  getExerciseSummaries,
  getPRsByExercise,
  listExercises,
} from '@/lib/db/queries';
import type { PersonalRecord, PRType } from '@/lib/db/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { toDisplayWeight } from '@/lib/units';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ACCENT_FILL_ID,
  ACTIVE_DOT,
  CHART_GOLD,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  ChartGradientDefs,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';
import { categoryDotClass } from '@/features/exercises/utils';
import { ActivityProgress } from './ActivityProgress';

type Metric = 'topWeight' | 'e1rm' | 'volume';

/** Ποιος τύπος PR αντιστοιχεί σε κάθε metric του chart. */
const METRIC_PR: Record<Metric, PRType> = {
  topWeight: 'max_weight',
  e1rm: 'e1rm',
  volume: 'max_volume',
};

/**
 * Πρόοδος ανά άσκηση. Ο χρήστης διαλέγει ΤΙ μετρά: το καλύτερο σετ (topWeight)
 * δείχνει καθαρή δύναμη, το e1RM συγκρίνει σετ διαφορετικών επαναλήψεων, ο
 * όγκος δείχνει φόρτο. Είναι διαφορετικές ερωτήσεις, όχι διαφορετικά styles.
 */
export function ProgressPage() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [metric, setMetric] = useState<Metric>('topWeight');

  // Deep-link: ?exerciseId= από τη βιβλιοθήκη ασκήσεων → άνοιξε κατευθείαν
  // το chart, χωρίς να ξαναψάξει ο χρήστης το όνομα.
  useEffect(() => {
    const fromUrl = params.get('exerciseId');
    if (fromUrl) setExerciseId(fromUrl);
  }, [params]);

  const exercises = useLiveQuery(() => listExercises(), [], []);
  const summaries = useLiveQuery(
    () => getExerciseSummaries(),
    [],
    new Map<string, { lastTrainedAt: string | null; hasPR: boolean }>(),
  );
  const prsByExercise = useLiveQuery(
    () => getPRsByExercise(),
    [],
    new Map<string, PersonalRecord[]>(),
  );
  const rawPoints = useLiveQuery(
    () => (exerciseId ? getExerciseProgress(exerciseId, 365) : Promise.resolve([])),
    [exerciseId],
    [],
  );

  // Τα σημεία έρχονται σε kg (storage) — μετατρέπονται στη μονάδα του χρήστη
  // ΕΔΩ, μία φορά, ώστε το chart/PR-line/«best» να δουλεύουν όλα στην ίδια
  // κλίμακα χωρίς να ξαναμετατρέπει το καθένα ξεχωριστά.
  const points = useMemo(
    () =>
      rawPoints.map((p) => ({
        ...p,
        topWeight: p.topWeight != null ? toDisplayWeight(p.topWeight, unit) : null,
        e1rm: p.e1rm != null ? toDisplayWeight(p.e1rm, unit) : null,
        volume: toDisplayWeight(p.volume, unit),
      })),
    [rawPoints, unit],
  );

  const filtered = q
    ? exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : exercises;
  const selected = exercises.find((e) => e.id === exerciseId) ?? null;
  const withData = points.filter((p) => p[metric] != null);
  const best = withData.length
    ? Math.max(...withData.map((p) => Number(p[metric])))
    : null;

  // Το τρέχον PR για το επιλεγμένο metric — γίνεται γραμμή αναφοράς στο chart.
  // Το ίδιο kg→unit πέρασμα με τα σημεία, αλλιώς η γραμμή θα έπεφτε σε λάθος ύψος.
  const prValueKg =
    (prsByExercise.get(exerciseId ?? '') ?? []).find((r) => r.type === METRIC_PR[metric])
      ?.value ?? null;
  const prValue = prValueKg != null ? toDisplayWeight(prValueKg, unit) : null;

  const close = () => {
    setExerciseId(null);
    if (params.has('exerciseId')) setParams({}, { replace: true });
  };

  const onExport = async () => {
    if (!exerciseId) return;
    const csv = await exportExerciseCsv(exerciseId);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected?.name ?? 'exercise'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header>
        <Link to="/history" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t('history.title')}
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">
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
          <ul className="stagger divide-y divide-border/60 overflow-hidden rounded-lg bg-card">
            {filtered.map((e) => {
              const s = summaries.get(e.id);
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setExerciseId(e.id)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-elevated"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {/* ★ = έχει PR (χρυσό = επίτευξη), ● = έχει προπονηθεί·
                          αλλιώς ο χρήστης ψάχνει στα τυφλά ποια άσκηση αξίζει
                          να ανοίξει */}
                      {s?.hasPR ? (
                        <span className="shrink-0 text-gold" aria-hidden>★</span>
                      ) : s?.lastTrainedAt ? (
                        <span className="shrink-0 text-primary" aria-hidden>●</span>
                      ) : (
                        <span className="shrink-0 text-transparent" aria-hidden>·</span>
                      )}
                      <span className="truncate text-sm font-medium">{e.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-elevated px-2 py-0.5 text-[10px] uppercase text-muted-foreground">
                      <span
                        className={cn('h-1.5 w-1.5 shrink-0 rounded-full', categoryDotClass(e.category))}
                        aria-hidden
                      />
                      {e.category}
                    </span>
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t('progress.noMatch')}
              </li>
            )}
          </ul>
          <ActivityProgress />
        </section>
      ) : (
        <section className="animate-rise-in space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">{selected?.name}</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void onExport()}
                className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Download className="h-3 w-3" aria-hidden />
                CSV
              </button>
              <button
                onClick={close}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {t('progress.change')}
              </button>
            </div>
          </div>

          <div className="flex gap-1">
            {(['topWeight', 'e1rm', 'volume'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                className={cn(
                  'rounded-md border border-border px-3 py-1 text-xs transition-colors',
                  metric === m
                    ? 'border-primary/40 bg-primary text-primary-foreground shadow-glow-sm'
                    : 'hover:bg-elevated',
                )}
              >
                {t(`progress.${m}`)}
              </button>
            ))}
          </div>

          {withData.length < 2 ? (
            <div className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
              {t('progress.needMore')}
            </div>
          ) : (
            <div className="rounded-lg bg-card p-4">
              <div className="mb-2 flex justify-between text-xs text-muted-foreground">
                <span>
                  {withData.length} {t('progress.sessions')}
                </span>
                {best != null && (
                  <span className="font-mono">
                    {t('progress.best')}: {best} {unit}
                  </span>
                )}
              </div>
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={withData} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                    <ChartGradientDefs />
                    <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                    <XAxis
                      dataKey="date"
                      tickFormatter={(d: string) => d.slice(5)}
                      tick={CHART_TICK}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      domain={['dataMin - 2', 'dataMax + 2']}
                      tick={CHART_TICK}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                      formatter={(v: number) => [`${v} ${unit}`, t(`progress.${metric}`)]}
                    />
                    {prValue != null && (
                      <ReferenceLine y={prValue} stroke={CHART_GOLD} strokeDasharray="4 3">
                        <Label
                          value={`PR ${prValue} ${unit}`}
                          position="insideTopRight"
                          fill={CHART_GOLD}
                          className="text-[10px]"
                        />
                      </ReferenceLine>
                    )}
                    <Area
                      type="monotone"
                      dataKey={metric}
                      stroke={CHART_STROKE}
                      strokeWidth={CHART_STROKE_WIDTH}
                      fill={`url(#${ACCENT_FILL_ID})`}
                      dot={{ r: 2, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
                      activeDot={ACTIVE_DOT}
                      connectNulls
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
