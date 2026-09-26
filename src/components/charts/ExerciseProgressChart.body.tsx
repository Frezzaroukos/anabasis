import { useTranslation } from 'react-i18next';
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
import type { WeightUnit } from '@/lib/db/types';
import {
  ACCENT_FILL_ID,
  ACTIVE_DOT,
  CHART_CURSOR,
  CHART_GOLD,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  ChartGradientDefs,
  REFERENCE_LINE_DASH,
  TOOLTIP_STYLE,
} from './chartTheme';
import { tickFormatterFor, tickIntervalFor, type ChartRangeKey } from './timeRange';
import type { ChartMetric } from './ExerciseProgressChart';

/**
 * Lazy recharts σώμα του ExerciseProgressChart. Τα tabs/«best» ticker/έλεγχος
 * «λίγα σημεία» μένουν στον γονέα (eager)· εδώ μόνο ο καμβάς του γραφήματος,
 * ώστε το 406kB recharts chunk να μπαίνει μόνο όταν πράγματι δείχνουμε γράφημα.
 */
export default function ExerciseProgressChartBody({
  withData,
  metric,
  range,
  unit,
  unitless,
  labelKey,
  prValue,
}: {
  withData: Array<Record<string, unknown>>;
  metric: ChartMetric;
  range: ChartRangeKey;
  unit: WeightUnit;
  unitless: boolean;
  labelKey: string;
  prValue: number | null;
}) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={withData} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
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
          domain={['dataMin - 2', 'dataMax + 2']}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={CHART_CURSOR}
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
          formatter={(v: number) => [unitless ? `${v}` : `${v} ${unit}`, t(labelKey)]}
        />
        {prValue != null && (
          <ReferenceLine y={prValue} stroke={CHART_GOLD} strokeDasharray={REFERENCE_LINE_DASH}>
            <Label
              value={`PR ${prValue}${unitless ? '' : ` ${unit}`}`}
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
  );
}
