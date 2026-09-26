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
import {
  ACTIVE_DOT,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';

const FEEL_EMOJI = ['', '😩', '🙁', '😐', '🙂', '💪'];

interface FeelPoint {
  date: string;
  feel: number | null;
}

/** Lazy recharts σώμα του FeelChart — δες VolumeChart.body για το «γιατί». */
export default function FeelChartBody({ withFeel }: { withFeel: FeelPoint[] }) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={withFeel} margin={{ top: 4, right: 6, bottom: 0, left: -24 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(5)}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          domain={[1, 5]}
          ticks={[1, 2, 3, 4, 5]}
          tick={{ ...CHART_TICK, fontSize: 12 }}
          width={28}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => FEEL_EMOJI[v] ?? ''}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
          formatter={(v: number) => [`${FEEL_EMOJI[v] ?? ''} ${v}/5`, t('history.feel')]}
        />
        <Line
          type="monotone"
          dataKey="feel"
          stroke={CHART_STROKE}
          strokeWidth={CHART_STROKE_WIDTH}
          dot={{ r: 3, fill: 'hsl(var(--primary))', strokeWidth: 0 }}
          activeDot={ACTIVE_DOT}
          connectNulls
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
