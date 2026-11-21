import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WeightUnit } from '@/lib/db/types';
import {
  CHART_GOLD,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  ChartGradientDefs,
  GOLD_FILL_ID,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';
import { tickFormatterFor, tickIntervalFor, type ChartRangeKey } from '@/components/charts/timeRange';
import type { PRTimelinePoint } from '@/lib/db/analytics';

/**
 * Lazy recharts σώμα των analytics της Προόδου. Ένα chunk για τα τέσσερα
 * γραφήματα (volume/frequency/categories/PRs) — το recharts κατεβαίνει μόνο
 * όταν υπάρχει πραγματικά δεδομένο να ζωγραφιστεί.
 */

export interface WeeklyVolumeDatum {
  weekStart: string;
  volume: number;
  sets: number;
}

export interface FrequencyDatum {
  weekStart: string;
  sessions: number;
}

export interface CategoryDatum {
  label: string;
  sets: number;
  volume: number;
}

/** Σταθερή τοπική ημερομηνία για tooltip — όχι UTC shift από `new Date(iso)`. */
function localDateLabel(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
  });
}

function compact(value: number): string {
  if (Math.abs(value) >= 10_000) return `${Math.round(value / 1000)}k`;
  if (Math.abs(value) >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}

function ChartFrame({
  summary,
  children,
}: {
  summary: string;
  children: React.ReactElement;
}) {
  return (
    <div role="img" aria-label={summary} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        {children}
      </ResponsiveContainer>
    </div>
  );
}

export function WeeklyVolumeChart({
  data,
  unit,
  range,
  summary,
}: {
  data: WeeklyVolumeDatum[];
  unit: WeightUnit;
  range: ChartRangeKey;
  summary: string;
}) {
  const { t } = useTranslation();
  return (
    <ChartFrame summary={summary}>
      <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="weekStart"
          tickFormatter={tickFormatterFor(range)}
          interval={tickIntervalFor(range, data.length)}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          width={44}
          tickFormatter={(v: number) => compact(v)}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d: string) => t('progress.analytics.weekOf', { date: localDateLabel(d) })}
          formatter={(v: number) => [
            `${Math.round(v).toLocaleString()} ${unit}`,
            t('progress.analytics.volume'),
          ]}
        />
        <Bar dataKey="volume" fill={CHART_STROKE} radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartFrame>
  );
}

export function FrequencyChart({
  data,
  range,
  summary,
}: {
  data: FrequencyDatum[];
  range: ChartRangeKey;
  summary: string;
}) {
  const { t } = useTranslation();
  return (
    <ChartFrame summary={summary}>
      <BarChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="weekStart"
          tickFormatter={tickFormatterFor(range)}
          interval={tickIntervalFor(range, data.length)}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          width={30}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d: string) => t('progress.analytics.weekOf', { date: localDateLabel(d) })}
          formatter={(v: number) => [`${v}`, t('progress.analytics.sessions')]}
        />
        <Bar dataKey="sessions" fill={CHART_STROKE} radius={[3, 3, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ChartFrame>
  );
}

export function CategoryChart({
  data,
  unit,
  summary,
}: {
  data: CategoryDatum[];
  unit: WeightUnit;
  summary: string;
}) {
  const { t } = useTranslation();
  return (
    <ChartFrame summary={summary}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} horizontal={false} />
        <XAxis
          type="number"
          allowDecimals={false}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="label"
          width={76}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: string) => (v.length > 11 ? `${v.slice(0, 10)}…` : v)}
        />
        <Tooltip
          cursor={{ fill: 'hsl(var(--muted) / 0.35)' }}
          contentStyle={TOOLTIP_STYLE}
          formatter={(v: number, _name, item) => {
            const volume = (item as { payload?: { volume?: number } } | undefined)?.payload
              ?.volume;
            return [
              `${v} ${t('progress.analytics.sets')}${
                volume != null ? ` · ${volume.toLocaleString()} ${unit}` : ''
              }`,
              t('progress.analytics.categories'),
            ];
          }}
        />
        <Bar dataKey="sets" fill={CHART_STROKE} radius={[0, 3, 3, 0]} maxBarSize={18} />
      </BarChart>
    </ChartFrame>
  );
}

export function PRTimelineChart({
  data,
  range,
  summary,
}: {
  data: PRTimelinePoint[];
  range: ChartRangeKey;
  summary: string;
}) {
  const { t } = useTranslation();
  return (
    <ChartFrame summary={summary}>
      <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
        <ChartGradientDefs />
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={tickFormatterFor(range)}
          interval={tickIntervalFor(range, data.length)}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          allowDecimals={false}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          width={30}
        />
        <Tooltip
          contentStyle={{ ...TOOLTIP_STYLE, maxWidth: 280 }}
          labelFormatter={(d: string) => localDateLabel(d)}
          formatter={(v: number, _name, item) => {
            const events = (
              item as
                | { payload?: { events?: Array<{ name: string; type: string }> } }
                | undefined
            )?.payload?.events;
            const detail =
              events
                ?.map((e) => `${e.name || '—'} · ${t(`history.pr.${e.type}`, { defaultValue: e.type })}`)
                .join(', ') ?? '';
            return [`${v} ${t('progress.analytics.prs')}`, detail];
          }}
        />
        <Area
          type="stepAfter"
          dataKey="cumulative"
          stroke={CHART_GOLD}
          strokeWidth={CHART_STROKE_WIDTH}
          fill={`url(#${GOLD_FILL_ID})`}
          dot={{ r: 2.5, fill: CHART_GOLD, strokeWidth: 0 }}
          activeDot={{
            r: 5,
            strokeWidth: 2,
            stroke: 'hsl(var(--background))',
            fill: CHART_GOLD,
          }}
        />
      </AreaChart>
    </ChartFrame>
  );
}
