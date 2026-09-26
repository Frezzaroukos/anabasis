import { useTranslation } from 'react-i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { WeightUnit } from '@/lib/db/types';
import { CHART_GRID, CHART_STROKE, CHART_TICK, TOOLTIP_STYLE } from '@/components/charts/chartTheme';

interface VolumePoint {
  date: string;
  volume: number;
}

/**
 * Το recharts-βαρύ σώμα του VolumeChart, φορτωμένο lazy: το 406kB recharts chunk
 * κατεβαίνει μόνο όταν πρόκειται να ζωγραφιστεί γράφημα, όχι στο module-load της
 * σελίδας. Ο έλεγχος «έχει δεδομένα;» μένει στον γονέα ώστε να μη «φλασάρει»
 * skeleton σε άδειο ιστορικό.
 */
export default function VolumeChartBody({
  displayData,
  unit,
}: {
  displayData: VolumePoint[];
  unit: WeightUnit;
}) {
  const { t } = useTranslation();
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(8)}
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          interval={6}
        />
        <YAxis
          tick={CHART_TICK}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
          formatter={(v: number) => [`${v} ${unit}`, t('history.volume')]}
        />
        <Bar dataKey="volume" fill={CHART_STROKE} radius={[2, 2, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
