import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getFeelTrend } from '@/lib/db/queries';
import {
  ACTIVE_DOT,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';

const FEEL_EMOJI = ['', '😩', '🙁', '😐', '🙂', '💪'];

/**
 * Τάση «αίσθησης» (feel 1-5) — το πεδίο καταγράφεται ήδη σε non-strength
 * προπονήσεις αλλά ήταν αόρατο. Κανένα correlation-claim: απλώς δείχνει πώς
 * ένιωθες με τον χρόνο, δίπλα στα δεδομένα όγκου. Ο χρήστης βγάζει το νόημα.
 */
export function FeelChart({ days = 60 }: { days?: number }) {
  const { t } = useTranslation();
  const data = useLiveQuery(() => getFeelTrend(days), [days], []);

  const withFeel = data.filter((p) => p.feel != null);
  if (withFeel.length < 2) return null;

  return (
    <section className="rounded-lg bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t('history.feelTrend')}</h2>
        <span className="text-xs text-muted-foreground">
          {t('history.lastDays', { days })}
        </span>
      </div>
      <div className="h-32 w-full">
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
      </div>
    </section>
  );
}
