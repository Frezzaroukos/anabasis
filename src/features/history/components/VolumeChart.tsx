import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { getTrainingSummary, getVolumeTrend } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { toDisplayWeight } from '@/lib/units';

/**
 * Όγκος ανά ημέρα, 30 ημέρες. Bars (όχι line) επίτηδες: η προπόνηση είναι
 * διακριτά γεγονότα, όχι συνεχής συνάρτηση — μια γραμμή θα υπονοούσε
 * ότι προπονήθηκες και τις ενδιάμεσες μέρες.
 */
export function VolumeChart({ days = 30 }: { days?: number }) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const data = useLiveQuery(() => getVolumeTrend(days), [days], []);
  const summary = useLiveQuery(
    () => getTrainingSummary(days),
    [days],
    { totalVolume: 0, totalSets: 0, activeDays: 0, days },
  );

  // Το bar chart διαβάζει την τιμή απευθείας από dataKey="volume" — η
  // μετατροπή γίνεται ΕΔΩ, μία φορά, ώστε ο άξονας/tooltip να δείχνουν ήδη
  // στη σωστή μονάδα χωρίς να ξαναμετατρέπει το καθένα.
  const displayData = useMemo(
    () => data.map((p) => ({ ...p, volume: toDisplayWeight(p.volume, unit, 'plate') })),
    [data, unit],
  );
  const totalVolume = toDisplayWeight(summary.totalVolume, unit, 'plate');

  if (summary.totalSets === 0) return null;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t('history.volumeTrend')}</h2>
        <span className="text-xs text-muted-foreground">
          {t('history.lastDays', { days })}
        </span>
      </div>

      <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
        {(
          [
            ['totalVolume', `${Math.round(totalVolume / 1000)}k`],
            ['totalSets', summary.totalSets],
            ['activeDays', `${summary.activeDays}/${days}`],
          ] as const
        ).map(([k, v]) => (
          <div key={k} className="rounded-md bg-muted/50 py-2">
            <dt className="text-[10px] uppercase text-muted-foreground">
              {t(`history.${k}`)}
            </dt>
            <dd className="font-mono text-sm">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="h-40 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={displayData} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="currentColor"
              className="text-border"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tickFormatter={(d: string) => d.slice(8)}
              tick={{ fontSize: 10 }}
              stroke="currentColor"
              className="text-muted-foreground"
              interval={6}
            />
            <YAxis
              tick={{ fontSize: 10 }}
              stroke="currentColor"
              className="text-muted-foreground"
              tickFormatter={(v: number) => (v >= 1000 ? `${v / 1000}k` : String(v))}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
              formatter={(v: number) => [`${v} ${unit}`, t('history.volume')]}
            />
            <Bar dataKey="volume" fill="currentColor" className="text-primary" radius={[2, 2, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
