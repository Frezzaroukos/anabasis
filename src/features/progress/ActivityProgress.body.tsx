import { useTranslation } from 'react-i18next';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ACCENT_FILL_ID,
  ACTIVE_DOT,
  CHART_CURSOR,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  ChartGradientDefs,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';
import { tickFormatterFor, tickIntervalFor, type ChartRangeKey } from '@/components/charts/timeRange';

type ActMetric = 'distanceKm' | 'paceSecPerKm';

function fmtPace(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** Lazy recharts σώμα του ActivityProgress — δες VolumeChart.body για το «γιατί». */
export default function ActivityProgressBody({
  withData,
  metric,
  range,
}: {
  withData: Array<Record<string, unknown>>;
  metric: ActMetric;
  range: ChartRangeKey;
}) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={withData} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
        <ChartGradientDefs />
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={tickFormatterFor(range)}
          interval={tickIntervalFor(range, withData.length)}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={['dataMin', 'dataMax']}
          reversed={metric === 'paceSecPerKm'}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) =>
            metric === 'paceSecPerKm' ? fmtPace(v) : String(Math.round(v * 10) / 10)
          }
        />
        <Tooltip
          cursor={CHART_CURSOR}
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
          formatter={(v: number) => [
            metric === 'paceSecPerKm' ? `${fmtPace(v)}/km` : `${v} km`,
            t(metric === 'paceSecPerKm' ? 'progress.pace' : 'progress.distance'),
          ]}
        />
        {/* Reversed άξονας (ρυθμός: μικρότερο = καλύτερο) — το gradient fill θα
            «κρεμόταν» ανάποδα οπτικά· καθαρή γραμμή εκεί, gradient area μόνο όταν
            ο άξονας διαβάζεται φυσιολογικά. */}
        {metric === 'paceSecPerKm' ? (
          <Line
            type="monotone"
            dataKey={metric}
            stroke={CHART_STROKE}
            strokeWidth={CHART_STROKE_WIDTH}
            dot={{ r: 2, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
            activeDot={ACTIVE_DOT}
            connectNulls
          />
        ) : (
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
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
