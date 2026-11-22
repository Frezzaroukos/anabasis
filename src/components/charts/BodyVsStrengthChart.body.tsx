import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BodyVsStrengthPoint } from '@/lib/db/analytics';
import type { WeightUnit } from '@/lib/db/types';
import {
  CHART_GOLD,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  TOOLTIP_STYLE,
} from './chartTheme';
import { localNoon, tickFormatterFor, tickIntervalFor, type ChartRangeKey } from './timeRange';

/** Lazy recharts σώμα: δύο γραμμές σε κοινό δείκτη (πρώτη τιμή = 100). */
export default function BodyVsStrengthChartBody({
  data,
  unit,
  range,
  summary,
}: {
  data: BodyVsStrengthPoint[];
  unit: WeightUnit;
  range: ChartRangeKey;
  summary: string;
}) {
  const { t } = useTranslation();
  return (
    <div role="img" aria-label={summary} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: 0 }}>
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
            domain={['dataMin - 2', 'dataMax + 2']}
            tick={CHART_TICK}
            axisLine={false}
            tickLine={false}
            width={36}
            tickFormatter={(v: number) => String(Math.round(v))}
          />
          <ReferenceLine y={100} stroke={CHART_GRID} strokeDasharray="4 4" />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(d: string) => localNoon(d).toLocaleDateString()}
            formatter={(_v: number, name: string, item) => {
              const p = (item as { payload?: BodyVsStrengthPoint } | undefined)?.payload;
              if (name === 'strengthIdx') {
                return [`${p?.strength ?? '–'} ${unit}`, t('progress.bodyVsStrength.strength')];
              }
              return [`${p?.body ?? '–'} ${unit}`, t('progress.bodyVsStrength.body')];
            }}
          />
          <Line
            type="monotone"
            dataKey="strengthIdx"
            name="strengthIdx"
            stroke={CHART_STROKE}
            strokeWidth={CHART_STROKE_WIDTH}
            dot={{ r: 2, fill: CHART_STROKE, strokeWidth: 0 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="bodyIdx"
            name="bodyIdx"
            stroke={CHART_GOLD}
            strokeWidth={CHART_STROKE_WIDTH}
            dot={false}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
