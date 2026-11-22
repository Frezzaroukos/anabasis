import { lazy, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ExercisePoint } from '@/lib/db/queries';
import { getBodyWeightSeries } from '@/lib/db/analyticsQueries';
import { buildBodyVsStrength } from '@/lib/db/analytics';
import type { WeightUnit } from '@/lib/db/types';
import { toDisplayWeight } from '@/lib/units';
import { ChartCard } from './ChartCard';
import { CHART_RANGE_DAYS, type ChartRangeKey } from './timeRange';

const Body = lazy(() => import('./BodyVsStrengthChart.body'));

/**
 * Σωματικό βάρος vs δύναμη για ασκήσεις σωματικού βάρους. Δύναμη = e1RM του
 * ΣΥΝΟΛΙΚΟΥ φορτίου (σωματικό + πρόσθετο) από τα ίδια σημεία του chart προόδου·
 * και οι δύο σειρές σε κοινό δείκτη (πρώτη τιμή = 100) → ένας άξονας, καθαρό
 * στα 320px. Κρύβεται όταν δεν υπάρχουν ≥2 σημεία σε κάθε σειρά.
 */
export function BodyVsStrengthChart({
  points,
  unit,
  range,
}: {
  points: ExercisePoint[];
  unit: WeightUnit;
  range: ChartRangeKey;
}) {
  const { t } = useTranslation();
  const days = CHART_RANGE_DAYS[range];
  const bodySeries = useLiveQuery(() => getBodyWeightSeries(days), [days], []);

  const data = useMemo(
    () =>
      buildBodyVsStrength(
        points
          .filter((p) => p.e1rm != null)
          .map((p) => ({ date: p.date, value: toDisplayWeight(p.e1rm as number, unit) })),
        bodySeries.map((p) => ({ date: p.date, value: toDisplayWeight(p.value, unit, 'body') })),
      ),
    [points, bodySeries, unit],
  );
  if (data.length === 0) return null;

  return (
    <ChartCard
      title={t('progress.bodyVsStrength.title')}
      hint={t('progress.bodyVsStrength.hint')}
      height="h-48"
      footer={
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <li className="flex items-center gap-1">
            <span aria-hidden className="h-2 w-2 rounded-full bg-primary" />
            {t('progress.bodyVsStrength.strength')}
          </li>
          <li className="flex items-center gap-1">
            <span aria-hidden className="h-2 w-2 rounded-full bg-gold" />
            {t('progress.bodyVsStrength.body')}
          </li>
        </ul>
      }
    >
      <Body
        data={data}
        unit={unit}
        range={range}
        summary={`${t('progress.bodyVsStrength.title')}: ${data.filter((d) => d.strength != null).length}`}
      />
    </ChartCard>
  );
}
