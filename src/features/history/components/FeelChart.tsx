import { lazy, Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getFeelTrend } from '@/lib/db/queries';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';

const FeelChartBody = lazy(() => import('./FeelChart.body'));

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
    <section className="rounded-xl bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">{t('history.feelTrend')}</h2>
        <span className="font-mono text-xs tabular-nums text-muted-foreground">
          {t('history.lastDays', { days })}
        </span>
      </div>
      <div className="h-32 w-full">
        <Suspense fallback={<ChartSkeleton />}>
          <FeelChartBody withFeel={withFeel} />
        </Suspense>
      </div>
    </section>
  );
}
