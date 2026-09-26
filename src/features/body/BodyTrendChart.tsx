import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WeightUnit } from '@/lib/db/types';
import {
  ACTIVE_DOT,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';

export type BodyTrendVariant = 'weight' | 'bodyFat' | 'steps';

/**
 * Lazy recharts σώμα για τα τρία trend charts του Σώματος (βάρος/λίπος/βήματα).
 * Το recharts chunk κατεβαίνει μόνο όταν πράγματι ζωγραφίζεται γράφημα. Οι τρεις
 * παραλλαγές ζουν σε ΔΙΑΦΟΡΕΤΙΚΕΣ κλίμακες, γι' αυτό διαφορετικά domain/format.
 */
export default function BodyTrendChart({
  variant,
  data,
  days,
  unit,
}: {
  variant: BodyTrendVariant;
  data: Array<Record<string, unknown>>;
  days: number;
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  const interval = Math.max(1, Math.floor(days / 6));

  const config = {
    weight: {
      dataKey: 'weight',
      marginLeft: -18,
      yDomain: ['dataMin - 1', 'dataMax + 1'] as [string, string],
      yWidth: undefined as number | undefined,
      format: (v: number): [string, string] => [`${v} ${unit}`, t('body.weight')],
    },
    bodyFat: {
      dataKey: 'bodyFatPct',
      marginLeft: -18,
      yDomain: [0, 'dataMax + 5'] as [number, string],
      yWidth: undefined as number | undefined,
      format: (v: number): [string, string] => [`${v}%`, t('body.bodyFat')],
    },
    steps: {
      dataKey: 'steps',
      marginLeft: -6,
      yDomain: [0, 'dataMax + 500'] as [number, string],
      yWidth: 44 as number | undefined,
      format: (v: number): [string, string] => [v.toLocaleString(), t('body.steps')],
    },
  }[variant];

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 4, right: 6, bottom: 0, left: config.marginLeft }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(5)}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          interval={interval}
        />
        <YAxis
          domain={config.yDomain}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          width={config.yWidth}
        />
        <Tooltip contentStyle={TOOLTIP_STYLE} formatter={config.format} />
        <Line
          type="monotone"
          dataKey={config.dataKey}
          stroke={CHART_STROKE}
          strokeWidth={CHART_STROKE_WIDTH}
          dot={false}
          activeDot={ACTIVE_DOT}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
