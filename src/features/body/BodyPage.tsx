import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp } from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getBodyMetric, getBodyTrend, localDay, saveBodyMetric } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight, parseWeightToKg, toDisplayWeight } from '@/lib/units';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCountUp } from '@/hooks/useCountUp';
import {
  ACTIVE_DOT,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';

// Χωρίς 30/60/90/180 επιλογέα (owner: περιττός) — δείχνουμε ό,τι υπάρχει,
// ένα χρόνο πίσω· τα κενά γεμίζουν, οπότε το εύρος δεν «ψεύδεται».
const TREND_DAYS = 365;

/**
 * Σώμα: βάρος, ποσοστό λίπους και χειροκίνητα βήματα. Το φαγητό/θερμίδες τα
 * χειρίζεται ξεχωριστό app — εδώ μένουν μόνο μετρικές που δένουν με την
 * προπόνηση. Ξεχωριστά charts επίτηδες: βάρος (~kg), λίπος (%) και βήματα
 * (~χιλιάδες) ζουν σε τελείως διαφορετικές κλίμακες.
 *
 * Χρωματική πειθαρχία (Carbon): οι τάσεις δείχνονται με βέλος (η κατεύθυνση
 * ΕΙΝΑΙ το σημαντικό), όχι με πράσινο/κόκκινο — το μόνο χρώμα είναι το χρυσό,
 * και μόνο για ρεκόρ (δεν υπάρχει εδώ).
 */
export function BodyPage() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const days = TREND_DAYS;
  const today = localDay();

  const trend = useLiveQuery(() => getBodyTrend(days), [days], []);
  const todayMetric = useLiveQuery(() => getBodyMetric(today), [today]);

  const [w, setW] = useState('');
  const [bf, setBf] = useState('');
  const [steps, setSteps] = useState('');

  useEffect(() => {
    if (!todayMetric) return;
    setW(
      todayMetric.weight_kg != null
        ? String(toDisplayWeight(todayMetric.weight_kg, unit, 'body'))
        : '',
    );
    setBf(todayMetric.body_fat_pct?.toString() ?? '');
    setSteps(todayMetric.steps?.toString() ?? '');
  }, [todayMetric, unit]);

  const num = (s: string) => {
    const v = Number(s);
    return s.trim() !== '' && Number.isFinite(v) ? v : null;
  };

  const save = () => {
    const weightInUnit = num(w);
    void saveBodyMetric(today, {
      weight_kg: weightInUnit != null ? parseWeightToKg(weightInUnit, unit) : null,
      body_fat_pct: num(bf),
      steps: num(steps),
    });
  };

  const weightPoints = trend.filter((p) => p.weight != null);
  const latest = weightPoints.at(-1)?.weight ?? null;
  const first = weightPoints[0]?.weight ?? null;
  const deltaKg = latest != null && first != null ? latest - first : null;
  const delta = deltaKg != null ? toDisplayWeight(deltaKg, unit, 'body') : null;
  const displayWeight = useCountUp(latest ?? 0, 450, 1);

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
        {/* Τρέχον σωματικό βάρος πάντα ορατό (ακόμα κι από ένα ζύγισμα) — είναι
            η τιμή που τροφοδοτεί το φορτίο των ασκήσεων σωματικού βάρους. */}
        {latest != null && (
          <div className="text-right">
            <p className="font-mono text-lg font-semibold tabular-nums leading-none">
              {formatWeight(latest, unit)}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {t('body.current')}
            </p>
          </div>
        )}
      </header>

      {/* Καταγραφή σημερινής μέρας — βάρος, λίπος, βήματα */}
      <section className="rounded-xl bg-card p-4">
        <p className="mb-3 text-sm font-medium">{t('body.logToday')}</p>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              [t('body.weight'), w, setW, unit],
              [t('body.bodyFat'), bf, setBf, '%'],
              [t('body.steps'), steps, setSteps, ''],
            ] as const
          ).map(([label, val, set, u]) => (
            <label key={label} className="block">
              <span className="mb-1 block text-[10px] uppercase tracking-wide text-muted-foreground">
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
        <Button className="mt-3 h-9" onClick={save}>
          {t('body.save')}
        </Button>
        {/* Σύνδεση με την προπόνηση: το βάρος εδώ είναι το bodyweight που μπαίνει
            στο φορτίο των ασκήσεων σωματικού βάρους (bw + πρόσθετο). */}
        <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
          {t('body.weightFeedsLoad')}
        </p>
      </section>

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
              <span className="flex items-center gap-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                {delta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(delta)} {unit}
              </span>
            )}
          </div>
          <ChartFrame>
            <LineChart data={weightTrend} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={CHART_TICK}
                axisLine={false}
                tickLine={false}
                interval={Math.max(1, Math.floor(days / 6))}
              />
              <YAxis domain={['dataMin - 1', 'dataMax + 1']} tick={CHART_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v} ${unit}`, t('body.weight')]} />
              <Line
                type="monotone"
                dataKey="weight"
                stroke={CHART_STROKE}
                strokeWidth={CHART_STROKE_WIDTH}
                dot={false}
                activeDot={ACTIVE_DOT}
                connectNulls
              />
            </LineChart>
          </ChartFrame>
        </section>
      )}

      {/* Λίπος % */}
      {bodyFatPoints.length > 1 && (
        <section className="rounded-xl bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">{t('body.bodyFatTrend')}</h2>
            {bfDelta != null && bfDelta !== 0 && (
              <span className="flex items-center gap-0.5 font-mono text-xs text-muted-foreground tabular-nums">
                {bfDelta > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                {Math.abs(Math.round(bfDelta * 10) / 10)}%
              </span>
            )}
          </div>
          <ChartFrame small>
            <LineChart data={trend} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={CHART_TICK}
                axisLine={false}
                tickLine={false}
                interval={Math.max(1, Math.floor(days / 6))}
              />
              <YAxis domain={[0, 'dataMax + 5']} tick={CHART_TICK} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, t('body.bodyFat')]} />
              <Line
                type="monotone"
                dataKey="bodyFatPct"
                stroke={CHART_STROKE}
                strokeWidth={CHART_STROKE_WIDTH}
                dot={false}
                activeDot={ACTIVE_DOT}
                connectNulls
              />
            </LineChart>
          </ChartFrame>
        </section>
      )}

      {/* Βήματα (χειροκίνητα) */}
      {stepPoints.length > 1 && (
        <section className="rounded-xl bg-card p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">{t('body.stepsTrend')}</h2>
            {stepAvg != null && (
              <span className="font-mono text-xs text-muted-foreground tabular-nums">
                {t('body.stepsAvg')} {stepAvg.toLocaleString()}
              </span>
            )}
          </div>
          <ChartFrame small>
            <LineChart data={trend} margin={{ top: 4, right: 6, bottom: 0, left: -6 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => d.slice(5)}
                tick={CHART_TICK}
                axisLine={false}
                tickLine={false}
                interval={Math.max(1, Math.floor(days / 6))}
              />
              <YAxis domain={[0, 'dataMax + 500']} tick={CHART_TICK} axisLine={false} tickLine={false} width={44} />
              <Tooltip
                contentStyle={TOOLTIP_STYLE}
                formatter={(v: number) => [v.toLocaleString(), t('body.steps')]}
              />
              <Line
                type="monotone"
                dataKey="steps"
                stroke={CHART_STROKE}
                strokeWidth={CHART_STROKE_WIDTH}
                dot={false}
                activeDot={ACTIVE_DOT}
                connectNulls
              />
            </LineChart>
          </ChartFrame>
        </section>
      )}
    </div>
  );
}

function ChartFrame({ children, small }: { children: React.ReactElement; small?: boolean }) {
  return (
    <div className={small ? 'h-40 w-full' : 'h-44 w-full'}>
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}
