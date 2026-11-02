import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Trophy } from 'lucide-react';
import {
  exportExerciseCsv,
  getExerciseProgress,
  getExerciseSummaries,
  getPRsByExercise,
  listExercises,
} from '@/lib/db/queries';
import type { PersonalRecord } from '@/lib/db/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Input } from '@/components/ui/input';
import {
  ExerciseProgressChart,
  CHART_RANGE_DAYS,
  type ChartMetric,
} from '@/components/charts/ExerciseProgressChart';
import type { ChartRangeKey } from '@/components/charts/timeRange';
import { CategoryBadge } from '@/components/CategoryBadge';
import { CategoryIcon } from '@/components/CategoryIcon';
import { ActivityProgress } from './ActivityProgress';
import { ProgressHistoryTabs } from '@/features/history/components/ProgressHistoryTabs';

const PROGRESS_METRICS: ChartMetric[] = ['topWeight', 'e1rm', 'volume'];

/**
 * Πρόοδος ανά άσκηση. Ο χρήστης διαλέγει ΤΙ μετρά: το καλύτερο σετ (topWeight)
 * δείχνει καθαρή δύναμη, το e1RM συγκρίνει σετ διαφορετικών επαναλήψεων, ο
 * όγκος δείχνει φόρτο. Είναι διαφορετικές ερωτήσεις, όχι διαφορετικά styles.
 */
export function ProgressPage() {
  const { t, i18n } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState('');
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [metric, setMetric] = useState<ChartMetric>('topWeight');
  // Προεπιλογή 3M — αρκετά σημεία για τάση χωρίς να πνίγει τον άξονα.
  const [range, setRange] = useState<ChartRangeKey>('3M');

  // Deep-link: ?exerciseId= από τη βιβλιοθήκη ασκήσεων → άνοιξε κατευθείαν
  // το chart, χωρίς να ξαναψάξει ο χρήστης το όνομα.
  useEffect(() => {
    const fromUrl = params.get('exerciseId');
    if (fromUrl) setExerciseId(fromUrl);
  }, [params]);

  const exercises = useLiveQuery(() => listExercises(), [], []);
  const summaries = useLiveQuery(
    () => getExerciseSummaries(),
    [],
    new Map<string, { lastTrainedAt: string | null; hasPR: boolean }>(),
  );
  const prsByExercise = useLiveQuery(
    () => getPRsByExercise(),
    [],
    new Map<string, PersonalRecord[]>(),
  );
  const rangeDays = CHART_RANGE_DAYS[range];
  const rawPoints = useLiveQuery(
    () => (exerciseId ? getExerciseProgress(exerciseId, rangeDays) : Promise.resolve([])),
    [exerciseId, rangeDays],
    [],
  );

  const filtered = q
    ? exercises.filter((e) => e.name.toLowerCase().includes(q.toLowerCase()))
    : exercises;
  const selected = exercises.find((e) => e.id === exerciseId) ?? null;
  const exercisePRs = prsByExercise.get(exerciseId ?? '') ?? [];

  const close = () => {
    setExerciseId(null);
    if (params.has('exerciseId')) setParams({}, { replace: true });
  };

  const onExport = async () => {
    if (!exerciseId) return;
    const csv = await exportExerciseCsv(exerciseId);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selected?.name ?? 'exercise'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('progress.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('progress.hint')}</p>
      </header>

      <ProgressHistoryTabs />

      {!exerciseId ? (
        <section className="space-y-3">
          <Input
            placeholder={t('workout.searchExercises')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-10"
          />
          <ul className="stagger divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
            {filtered.map((e) => {
              const s = summaries.get(e.id);
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setExerciseId(e.id)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left transition-colors hover:bg-elevated active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {/* Trophy (χρυσό) = έχει PR· διακριτική κουκκίδα = έχει
                          προπονηθεί· αλλιώς κενό — καθαρό εικονίδιο αντί για
                          ανάμεικτα Unicode σύμβολα. */}
                      <CategoryIcon category={e.category} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{e.name}</span>
                        <span className="block text-[11px] text-muted-foreground">
                          {s?.lastTrainedAt
                            ? t('progress.lastTrained', {
                                date: new Date(s.lastTrainedAt).toLocaleDateString(i18n.resolvedLanguage),
                              })
                            : t('progress.never')}
                        </span>
                      </span>
                      {s?.hasPR && <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />}
                    </span>
                    <CategoryBadge category={e.category} />
                  </button>
                </li>
              );
            })}
            {filtered.length === 0 && (
              <li className="px-4 py-6 text-center text-sm text-muted-foreground">
                {t('progress.noMatch')}
              </li>
            )}
          </ul>
          <ActivityProgress />
        </section>
      ) : (
        <section className="animate-rise-in space-y-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-lg font-medium">{selected?.name}</h2>
            <div className="flex items-center gap-3">
              <button
                onClick={() => void onExport()}
                className="flex items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                <Download className="h-3 w-3" aria-hidden />
                CSV
              </button>
              <button
                onClick={close}
                className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {t('progress.change')}
              </button>
            </div>
          </div>

          <ExerciseProgressChart
            rawPoints={rawPoints}
            prs={exercisePRs}
            unit={unit}
            metrics={PROGRESS_METRICS}
            metric={metric}
            onMetricChange={setMetric}
            range={range}
            onRangeChange={setRange}
          />
        </section>
      )}
    </div>
  );
}
