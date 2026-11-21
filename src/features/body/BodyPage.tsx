import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp, Check, Info, Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { getBodyMetric, getBodyTrend, getBodyweightLoads, localDay, saveBodyMetric } from '@/lib/db/queries';
import { clearBodyMetric, listRecentBodyMetrics } from '@/lib/db/workoutHelpers';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight, parseWeightToKg, toDisplayWeight } from '@/lib/units';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useCountUp } from '@/hooks/useCountUp';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';
import { cn } from '@/lib/utils';

const BodyTrendChart = lazy(() => import('./BodyTrendChart'));

const TREND_DAYS = 365;

/**
 * Σώμα: βάρος, ποσοστό λίπους και χειροκίνητα βήματα — με επιλογή οποιασδήποτε
 * ημερομηνίας και λίστα πρόσφατων καταχωρίσεων για γρήγορη διόρθωση/διαγραφή.
 */
export function BodyPage() {
  const { t, i18n } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const days = TREND_DAYS;
  const today = localDay();
  const [selectedDate, setSelectedDate] = useState(today);
  const [justSaved, setJustSaved] = useState(false);
  const [deleteDate, setDeleteDate] = useState<string | null>(null);

  const trend = useLiveQuery(() => getBodyTrend(days), [days], []);
  const selectedMetric = useLiveQuery(() => getBodyMetric(selectedDate), [selectedDate]);
  const recentEntries = useLiveQuery(() => listRecentBodyMetrics(10), [], []);
  const bodyweightLoads = useLiveQuery(() => getBodyweightLoads(5), [], []);

  const [w, setW] = useState('');
  const [bf, setBf] = useState('');
  const [steps, setSteps] = useState('');

  useEffect(() => {
    if (!selectedMetric) {
      setW('');
      setBf('');
      setSteps('');
      return;
    }
    setW(
      selectedMetric.weight_kg != null
        ? String(toDisplayWeight(selectedMetric.weight_kg, unit, 'body'))
        : '',
    );
    setBf(selectedMetric.body_fat_pct?.toString() ?? '');
    setSteps(selectedMetric.steps?.toString() ?? '');
  }, [selectedMetric, selectedDate, unit]);

  const num = (s: string) => {
    const cleaned = s.trim().replace(',', '.');
    if (cleaned === '') return null;
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : null;
  };

  const save = async () => {
    const weightInUnit = num(w);
    await saveBodyMetric(selectedDate, {
      weight_kg: weightInUnit != null ? parseWeightToKg(weightInUnit, unit) : null,
      body_fat_pct: num(bf),
      steps: num(steps),
    });
    setJustSaved(true);
    globalThis.setTimeout(() => setJustSaved(false), 1800);
  };

  const weightPoints = trend.filter((p) => p.weight != null);
  const latest = weightPoints.at(-1)?.weight ?? null;
  const first = weightPoints[0]?.weight ?? null;
  const deltaKg = latest != null && first != null ? latest - first : null;
  const delta = deltaKg != null ? toDisplayWeight(deltaKg, unit, 'body') : null;
  const displayWeight = useCountUp(latest != null ? toDisplayWeight(latest, unit, 'body') : 0, 450, 1);

  const weightTrend = useMemo(
    () =>
      trend.map((p) => ({
        ...p,
        weight: p.weight != null ? toDisplayWeight(p.weight, unit, 'body') : null,
      })),
    [trend, unit],
  );

  const bodyFatPoints = trend.filter((p) => p.bodyFatPct != null);
  const latestBF = bodyFatPoints.at(-1)?.bodyFatPct ?? null;
  const firstBF = bodyFatPoints[0]?.bodyFatPct ?? null;
  const bfDelta = latestBF != null && firstBF != null ? latestBF - firstBF : null;

  const stepPoints = trend.filter((p) => p.steps != null);
  const stepAvg =
    stepPoints.length > 0
      ? Math.round(stepPoints.reduce((s, p) => s + (p.steps ?? 0), 0) / stepPoints.length)
      : null;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-2">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('body.title')}</h1>
        {latest != null && (
          <div className="text-right">
            <p className="font-mono text-lg font-semibold leading-none tabular-nums">
              {formatWeight(latest, unit)}
            </p>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('body.current')}
            </p>
          </div>
        )}
      </header>

      {/* Bodyweight importance callout */}
      <div className="flex items-start gap-2 rounded-lg border-l-4 border-primary bg-primary/5 p-3">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <p className="text-xs font-medium leading-relaxed text-foreground">
          {t('body.weightImportantTip')}
        </p>
      </div>

      {bodyweightLoads.length > 0 && (
        <section className="rounded-xl border border-border/60 bg-card p-4">
          <h2 className="text-sm font-medium">{t('body.bodyweightLoad')}</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('body.bodyweightLoadHint')}</p>
          <ul className="mt-3 divide-y divide-border/60">
            {bodyweightLoads.map((row) => (
              <li key={row.exerciseId}>
                <Link
                  to={`/progress?exerciseId=${row.exerciseId}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-primary"
                >
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                    {formatWeight(row.loadKg, unit)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Καταγραφή για σήμερα ή οποιαδήποτε παλαιότερη ημερομηνία */}
      <section className="rounded-xl bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-medium">
            {selectedDate === today
              ? t('body.logToday')
              : t('body.logForDate', {
                  date: new Date(`${selectedDate}T12:00:00`).toLocaleDateString(i18n.resolvedLanguage),
                })}
          </p>
          <input
            type="date"
            value={selectedDate}
            max={today}
            aria-label={t('body.date')}
            onChange={(e) => setSelectedDate(e.target.value || today)}
            className="h-11 rounded-md border border-input bg-background px-2.5 font-mono text-xs tabular-nums text-muted-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring sm:h-9"
          />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [t('body.weight'), w, setW, unit],
              [t('body.bodyFat'), bf, setBf, '%'],
              [t('body.steps'), steps, setSteps, ''],
            ] as const
          ).map(([label, val, set, u]) => (
            <label key={label} className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                {label}
                {u ? ` (${u})` : ''}
              </span>
              <Input
                type="number"
                inputMode="decimal"
                value={val}
                onChange={(e) => set(e.target.value)}
                className="h-9 font-mono tabular-nums"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button className="h-9 tap:min-h-11" onClick={() => void save()}>
            {t('body.save')}
          </Button>
          {justSaved && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary" role="status">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {t('body.saved')}
            </span>
          )}
        </div>
        <p className="mt-3 text-xs leading-snug text-muted-foreground">
          {t('body.weightFeedsLoad')}
        </p>
      </section>

      {/* Πρόσφατες καταχωρίσεις — tap για άμεση διόρθωση, κάδος για καθαρισμό */}
      {recentEntries.length > 0 && (
        <section className="rounded-xl bg-card p-4">
          <h2 className="mb-2 text-sm font-medium">{t('body.recentEntries')}</h2>
          <ul className="divide-y divide-border/60">
            {recentEntries.map((entry) => (
              <li
                key={entry.date}
                className={cn(
                  'flex items-center justify-between gap-2 py-2 text-sm',
                  entry.date === selectedDate && 'rounded-md bg-primary/5 px-2 -mx-2',
                )}
              >
                <button
                  type="button"
                  onClick={() => setSelectedDate(entry.date)}
                  className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-left"
                >
                  <span className="font-mono text-xs tabular-nums text-muted-foreground">
                    {entry.date}
                  </span>
                  {entry.weight_kg != null && (
                    <span className="font-mono font-medium tabular-nums">
                      {formatWeight(entry.weight_kg, unit, { granularity: 'body' })}
                    </span>
                  )}
                  {entry.body_fat_pct != null && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {entry.body_fat_pct}%
                    </span>
                  )}
                  {entry.steps != null && (
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      {entry.steps.toLocaleString()} {t('body.steps').toLowerCase()}
                    </span>
                  )}
                </button>
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSelectedDate(entry.date)}
                    aria-label={t('body.editEntry')}
                    title={t('body.editEntry')}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteDate(entry.date)}
                    aria-label={t('body.clearEntry')}
                    title={t('body.clearEntry')}
                    className="flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Βάρος */}
      {weightPoints.length > 1 && (
        <section className="rounded-xl bg-card p-4">
          <div className="mb-3 flex items-end justify-between gap-2">
            <div>
              <h2 className="text-sm font-medium text-muted-foreground">{t('body.weightTrend')}</h2>
              <p className="font-display text-3xl font-semibold leading-none tracking-tight tabular-nums">
                {displayWeight}
                <span className="ml-1 font-sans text-sm font-normal text-muted-foreground">{unit}</span>
              </p>
            </div>
            {delta != null && delta !== 0 && (
              <span className="flex items-center gap-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(delta)} {unit}
              </span>
            )}
          </div>
          <div className="h-44 w-full">
            <Suspense fallback={<ChartSkeleton />}>
              <BodyTrendChart
                variant="weight"
                data={weightTrend as unknown as Array<Record<string, unknown>>}
                days={days}
                unit={unit}
              />
            </Suspense>
          </div>
        </section>
      )}

      {/* Λίπος % */}
      {bodyFatPoints.length > 1 && (
        <section className="rounded-xl bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">{t('body.bodyFatTrend')}</h2>
            {bfDelta != null && bfDelta !== 0 && (
              <span className="flex items-center gap-0.5 font-mono text-xs tabular-nums text-muted-foreground">
                {bfDelta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(Math.round(bfDelta * 10) / 10)}%
              </span>
            )}
          </div>
          <div className="h-40 w-full">
            <Suspense fallback={<ChartSkeleton />}>
              <BodyTrendChart
                variant="bodyFat"
                data={trend as unknown as Array<Record<string, unknown>>}
                days={days}
                unit={unit}
              />
            </Suspense>
          </div>
        </section>
      )}

      {/* Βήματα (χειροκίνητα) */}
      {stepPoints.length > 1 && (
        <section className="rounded-xl bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">{t('body.stepsTrend')}</h2>
            {stepAvg != null && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {t('body.stepsAvg')} {stepAvg.toLocaleString()}
              </span>
            )}
          </div>
          <div className="h-40 w-full">
            <Suspense fallback={<ChartSkeleton />}>
              <BodyTrendChart
                variant="steps"
                data={trend as unknown as Array<Record<string, unknown>>}
                days={days}
                unit={unit}
              />
            </Suspense>
          </div>
        </section>
      )}

      <ConfirmDialog
        open={deleteDate != null}
        title={t('body.deleteEntryTitle')}
        description={
          deleteDate
            ? t('body.deleteEntryDesc', {
                date: new Date(`${deleteDate}T12:00:00`).toLocaleDateString(i18n.resolvedLanguage),
              })
            : undefined
        }
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          const date = deleteDate;
          setDeleteDate(null);
          if (date) void clearBodyMetric(date);
        }}
        onCancel={() => setDeleteDate(null)}
      />
    </div>
  );
}
