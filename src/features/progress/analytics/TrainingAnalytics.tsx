import { lazy, Suspense, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppSettings } from '@/hooks/useAppSettings';
import { toDisplayWeight } from '@/lib/units';
import {
  getCategoryDistribution,
  getPRTimeline,
  getWeeklyFrequencySeries,
  getWeeklyVolumeSeries,
} from '@/lib/db/analyticsQueries';
import { Card, SectionTitle } from '@/components/ui/Section';
import { ChartSkeleton } from '@/components/charts/ChartSkeleton';
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector';
import { CHART_RANGE_DAYS, type ChartRangeKey } from '@/components/charts/timeRange';

const WeeklyVolumeChart = lazy(() =>
  import('./AnalyticsCharts.body').then((m) => ({ default: m.WeeklyVolumeChart })),
);
const FrequencyChart = lazy(() =>
  import('./AnalyticsCharts.body').then((m) => ({ default: m.FrequencyChart })),
);
const CategoryChart = lazy(() =>
  import('./AnalyticsCharts.body').then((m) => ({ default: m.CategoryChart })),
);
const PRTimelineChart = lazy(() =>
  import('./AnalyticsCharts.body').then((m) => ({ default: m.PRTimelineChart })),
);

/** Πάνω από 2 χρόνια εβδομαδιαίων μπαρών ο άξονας γίνεται θόρυβος. */
const MAX_WEEKS = 104;

function weeksForRange(range: ChartRangeKey): number {
  return Math.min(MAX_WEEKS, Math.max(4, Math.ceil(CHART_RANGE_DAYS[range] / 7)));
}

/**
 * Αναλυτικά προπόνησης στην Πρόοδο: εβδομαδιαίος όγκος, συχνότητα, κατανομή
 * σετ ανά κατηγορία και σωρευτικά PR — όλα από τα ίδια logged σετ, στην ίδια
 * μονάδα με το υπόλοιπο app. Επιστρέφει `null` όταν δεν υπάρχει κανένα
 * δεδομένο (καμία ψεύτικη μηδενική γραμμή).
 */
export function TrainingAnalytics() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const [range, setRange] = useState<ChartRangeKey>('3M');

  const weeks = weeksForRange(range);
  const days = CHART_RANGE_DAYS[range];

  const weekly = useLiveQuery(() => getWeeklyVolumeSeries(weeks), [weeks], []);
  const frequency = useLiveQuery(() => getWeeklyFrequencySeries(weeks), [weeks], []);
  const categories = useLiveQuery(() => getCategoryDistribution(days), [days], []);
  const prs = useLiveQuery(() => getPRTimeline(days), [days], []);

  const weeklyData = useMemo(
    () =>
      weekly.map((p) => ({
        ...p,
        volume: toDisplayWeight(p.volume, unit),
      })),
    [weekly, unit],
  );
  const categoryData = useMemo(
    () =>
      categories.map((c) => ({
        label: t(`workout.category.${c.category}`, { defaultValue: c.category }),
        sets: c.sets,
        volume: toDisplayWeight(c.volume, unit),
      })),
    [categories, t, unit],
  );

  const hasWeekly = weeklyData.some((p) => p.volume > 0);
  const hasFrequency = frequency.some((p) => p.sessions > 0);
  const hasCategories = categoryData.length > 0;
  const hasPRs = prs.length > 0;

  if (!hasWeekly && !hasFrequency && !hasCategories && !hasPRs) return null;

  const totalVolume = weeklyData.reduce((sum, p) => sum + p.volume, 0);
  const totalSessions = frequency.reduce((sum, p) => sum + p.sessions, 0);
  const totalSets = categoryData.reduce((sum, c) => sum + c.sets, 0);
  const totalPRs = prs.at(-1)?.cumulative ?? 0;

  return (
    <section className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-semibold tracking-tight">
            {t('progress.analytics.title')}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('progress.analytics.hint')}</p>
        </div>
        <TimeRangeSelector value={range} onChange={setRange} />
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-2">
        {hasWeekly && (
          <Card className="min-w-0">
            <SectionTitle
              action={
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {Math.round(totalVolume).toLocaleString()} {unit}
                </span>
              }
            >
              {t('progress.analytics.weeklyVolume')}
            </SectionTitle>
            <p className="text-xs text-muted-foreground">
              {t('progress.analytics.weeklyVolumeHint')}
            </p>
            <div className="mt-3 h-44 w-full">
              <Suspense fallback={<ChartSkeleton />}>
                <WeeklyVolumeChart
                  data={weeklyData}
                  unit={unit}
                  range={range}
                  summary={`${t('progress.analytics.summaryVolume')}: ${Math.round(totalVolume).toLocaleString()} ${unit}`}
                />
              </Suspense>
            </div>
          </Card>
        )}

        {hasFrequency && (
          <Card className="min-w-0">
            <SectionTitle
              action={
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {totalSessions} {t('progress.analytics.sessions')}
                </span>
              }
            >
              {t('progress.analytics.frequency')}
            </SectionTitle>
            <p className="text-xs text-muted-foreground">
              {t('progress.analytics.frequencyHint')}
            </p>
            <div className="mt-3 h-44 w-full">
              <Suspense fallback={<ChartSkeleton />}>
                <FrequencyChart
                  data={frequency}
                  range={range}
                  summary={`${t('progress.analytics.summaryFrequency')}: ${totalSessions}`}
                />
              </Suspense>
            </div>
          </Card>
        )}

        {hasCategories && (
          <Card className="min-w-0">
            <SectionTitle
              action={
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {totalSets} {t('progress.analytics.sets')}
                </span>
              }
            >
              {t('progress.analytics.categories')}
            </SectionTitle>
            <p className="text-xs text-muted-foreground">
              {t('progress.analytics.categoriesHint')}
            </p>
            <div className="mt-3 h-44 w-full">
              <Suspense fallback={<ChartSkeleton />}>
                <CategoryChart
                  data={categoryData}
                  unit={unit}
                  summary={`${t('progress.analytics.summaryCategories')}: ${totalSets}`}
                />
              </Suspense>
            </div>
          </Card>
        )}

        {hasPRs && (
          <Card className="min-w-0">
            <SectionTitle
              action={
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {totalPRs} {t('progress.analytics.prs')}
                </span>
              }
            >
              {t('progress.analytics.prTimeline')}
            </SectionTitle>
            <p className="text-xs text-muted-foreground">
              {t('progress.analytics.prTimelineHint')}
            </p>
            <div className="mt-3 h-44 w-full">
              <Suspense fallback={<ChartSkeleton />}>
                <PRTimelineChart
                  data={prs}
                  range={range}
                  summary={`${t('progress.analytics.summaryPrs')}: ${totalPRs}`}
                />
              </Suspense>
            </div>
          </Card>
        )}
      </div>
    </section>
  );
}
