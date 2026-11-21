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

export type BodyTrendVariant = 'weight' | 'bodyFat' | 'steps' | 'measurement';

/**
 * Lazy recharts σώμα για τα trend charts του Σώματος (βάρος/λίπος/βήματα/μέτρηση).
 * Το recharts chunk κατεβαίνει μόνο όταν πράγματι ζωγραφίζεται γράφημα. Κάθε
 * παραλλαγή έχει δική της κλίμακα, γι' αυτό διαφορετικά domain/format.
 *
 * Η `measurement` παραλλαγή είναι γενική: ο καλών δίνει `dataKey` (π.χ.
 * `waistCm`) και `label` (μεταφρασμένο όνομα μέτρησης + μονάδα).
 */
export default function BodyTrendChart({
  variant,
  data,
  days,
  unit,
  measurement,
}: {
  variant: BodyTrendVariant;
  data: Array<Record<string, unknown>>;
  days: number;
  unit: WeightUnit;
  measurement?: { dataKey: string; label: string; unitLabel: string };
}) {
  const { t } = useTranslation();
  const interval = Math.max(1, Math.floor(days / 6));

  const config = variant === 'measurement'
    ? {
        dataKey: measurement?.dataKey ?? 'waistCm',
        labelKey: '',
        marginLeft: -6,
        yDomain: ['dataMin - 2', 'dataMax + 2'] as [string, string],
        yWidth: 40 as number | undefined,
        format: (v: number): [string, string] => [
          `${v} ${measurement?.unitLabel ?? ''}`.trim(),
          measurement?.label ?? '',
        ],
        ariaLabel: measurement?.label ?? '',
      }
    : {
    weight: {
      dataKey: 'weight',
      labelKey: 'body.weightTrend',
      marginLeft: -18,
      yDomain: ['dataMin - 1', 'dataMax + 1'] as [string, string],
      yWidth: undefined as number | undefined,
      format: (v: number): [string, string] => [`${v} ${unit}`, t('body.weight')],
      ariaLabel: t('body.weightTrend'),
    },
    bodyFat: {
      dataKey: 'bodyFatPct',
      labelKey: 'body.bodyFatTrend',
      marginLeft: -18,
      yDomain: [0, 'dataMax + 5'] as [number, string],
      yWidth: undefined as number | undefined,
      format: (v: number): [string, string] => [`${v}%`, t('body.bodyFat')],
      ariaLabel: t('body.bodyFatTrend'),
    },
    steps: {
      dataKey: 'steps',
      labelKey: 'body.stepsTrend',
      marginLeft: -6,
      yDomain: [0, 'dataMax + 500'] as [number, string],
      yWidth: 44 as number | undefined,
      format: (v: number): [string, string] => [v.toLocaleString(), t('body.steps')],
      ariaLabel: t('body.stepsTrend'),
    },
  }[variant as 'weight' | 'bodyFat' | 'steps'];

  return (
    <div role="img" aria-label={config.ariaLabel} className="h-full w-full">
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
    </div>
  );
}
