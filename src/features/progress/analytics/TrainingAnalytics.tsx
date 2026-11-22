import { lazy, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAppSettings } from '@/hooks/useAppSettings';
import { toDisplayWeight } from '@/lib/units';
import {
  getCategoryDistribution,
  getPRTimeline,
  getTrainingHeatmap,
  getWeeklyCategorySets,
  getWeeklyFrequencySeries,
  getWeeklyVolumeSeries,
} from '@/lib/db/analyticsQueries';
import { ChartCard } from '@/components/charts/ChartCard';
import { TimeRangeSelector } from '@/components/charts/TimeRangeSelector';
import { TrainingHeatmap } from './TrainingHeatmap';
import { categoryColor } from './categoryColors';
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
const WeeklyCategoryChart = lazy(() =>
  import('./AnalyticsCharts.body').then((m) => ({ default: m.WeeklyCategoryChart })),
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
  const heatmapWeeks = Math.min(52, weeks);
  const heatmap = useLiveQuery(() => getTrainingHeatmap(heatmapWeeks), [heatmapWeeks], []);
  const weeklyCategories = useLiveQuery(() => getWeeklyCategorySets(weeks), [weeks], []);
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

  const categoryLabels = useMemo(
    () =>
      Object.fromEntries(
        [...new Set([...weeklyCategories.flatMap((p) => Object.keys(p.byCategory))])].map((c) => [
          c,
          t(`workout.category.${c}`, { defaultValue: c }),
        ]),
      ),
    [weeklyCategories, t],
  );
  const stackedCategories = useMemo(
    () => Object.keys(categoryLabels).sort(),
    [categoryLabels],
  );
  const weeklyCategoryData = useMemo(
    () => weeklyCategories.map((p) => ({ weekStart: p.weekStart, total: p.total, ...p.byCategory })),
    [weeklyCategories],
  );
  const hasWeeklyCategories = weeklyCategories.some((p) => p.total > 0);
  const activeDays = heatmap.filter((d) => d.sessions > 0).length;
  const hasHeatmap = activeDays > 0;
  const hasWeekly = weeklyData.some((p) => p.volume > 0);
  const hasFrequency = frequency.some((p) => p.sessions > 0);
  const hasCategories = categoryData.length > 0;
  const hasPRs = prs.length > 0;

  if (!hasHeatmap && !hasWeeklyCategories && !hasWeekly && !hasFrequency && !hasCategories && !hasPRs) return null;

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
        {hasHeatmap && (
          <div className="min-w-0 md:col-span-2">
            <ChartCard
              title={t('progress.analytics.heatmap')}
              total={`${activeDays} ${t('progress.analytics.activeDays')}`}
              hint={t('progress.analytics.heatmapHint')}
              height="h-auto"
            >
              <TrainingHeatmap
                days={heatmap}
                summary={`${t('progress.analytics.summaryHeatmap')}: ${activeDays}`}
              />
            </ChartCard>
          </div>
        )}

        {hasWeekly && (
          <ChartCard
            title={t('progress.analytics.weeklyVolume')}
            total={`${Math.round(totalVolume).toLocaleString()} ${unit}`}
            hint={t('progress.analytics.weeklyVolumeHint')}
          >
            <WeeklyVolumeChart
              data={weeklyData}
              unit={unit}
              range={range}
              summary={`${t('progress.analytics.summaryVolume')}: ${Math.round(totalVolume).toLocaleString()} ${unit}`}
            />
          </ChartCard>
        )}

        {hasFrequency && (
          <ChartCard
            title={t('progress.analytics.frequency')}
            total={`${totalSessions} ${t('progress.analytics.sessions')}`}
            hint={t('progress.analytics.frequencyHint')}
          >
            <FrequencyChart
              data={frequency}
              range={range}
              summary={`${t('progress.analytics.summaryFrequency')}: ${totalSessions}`}
            />
          </ChartCard>
        )}

        {hasWeeklyCategories && (
          <ChartCard
            title={t('progress.analytics.weeklyCategories')}
            total={`${totalSets} ${t('progress.analytics.sets')}`}
            hint={t('progress.analytics.weeklyCategoriesHint')}
            footer={
              <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {stackedCategories.map((c) => (
                  <li key={c} className="flex items-center gap-1">
                    <span
                      aria-hidden
                      className="h-2 w-2 rounded-full"
                      style={{ background: categoryColor(c) }}
                    />
                    {categoryLabels[c]}
                  </li>
                ))}
              </ul>
            }
          >
            <WeeklyCategoryChart
              data={weeklyCategoryData}
              categories={stackedCategories}
              labels={categoryLabels}
              range={range}
              summary={`${t('progress.analytics.summaryWeeklyCategories')}: ${totalSets}`}
            />
          </ChartCard>
        )}

        {hasCategories && (
          <ChartCard
            title={t('progress.analytics.categories')}
            total={`${totalSets} ${t('progress.analytics.sets')}`}
            hint={t('progress.analytics.categoriesHint')}
          >
            <CategoryChart
              data={categoryData}
              unit={unit}
              summary={`${t('progress.analytics.summaryCategories')}: ${totalSets}`}
            />
          </ChartCard>
        )}

        {hasPRs && (
          <ChartCard
            title={t('progress.analytics.prTimeline')}
            total={`${totalPRs} ${t('progress.analytics.prs')}`}
            hint={t('progress.analytics.prTimelineHint')}
          >
            <PRTimelineChart
              data={prs}
              range={range}
              summary={`${t('progress.analytics.summaryPrs')}: ${totalPRs}`}
            />
          </ChartCard>
        )}
      </div>
    </section>
  );
}
