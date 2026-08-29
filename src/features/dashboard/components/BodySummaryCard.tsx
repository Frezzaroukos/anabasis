import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { getBodyMetric, getBodyTrend, localDay } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight, toDisplayWeight } from '@/lib/units';
import { SectionTitle } from '@/components/ui/Section';

/**
 * Βάρος / λίπος / βήματα — μόνο ό,τι έχει καταγραφεί. Χρωματική πειθαρχία
 * (Carbon): η μεταβολή δείχνεται με βέλος, όχι με πράσινο/κόκκινο.
 */
export function BodySummaryCard() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const today = localDay();
  const trend = useLiveQuery(() => getBodyTrend(30), [], []);
  const todayMetric = useLiveQuery(() => getBodyMetric(today), [today]);

  const weights = trend.filter((p) => p.weight != null);
  const latestWeight = weights.at(-1)?.weight ?? null;
  const firstWeight = weights[0]?.weight ?? null;
  const weightDeltaKg =
    latestWeight != null && firstWeight != null ? latestWeight - firstWeight : null;
  const weightDelta = weightDeltaKg != null ? toDisplayWeight(weightDeltaKg, unit, 'body') : null;

  const bf = trend.filter((p) => p.bodyFatPct != null);
  const latestBF = bf.at(-1)?.bodyFatPct ?? null;
  const firstBF = bf[0]?.bodyFatPct ?? null;
  const bfDelta = latestBF != null && firstBF != null ? latestBF - firstBF : null;

  const todaySteps = todayMetric?.steps ?? null;

  if (latestWeight == null && latestBF == null && todaySteps == null) return null;

  return (
    <Link
      to="/body"
      className="block rounded-xl bg-card p-4 transition-colors duration-200 hover:bg-elevated"
    >
      <SectionTitle action={<span className="text-muted-foreground">→</span>}>
        {t('body.title')}
      </SectionTitle>
      <dl className="grid grid-cols-3 gap-2 text-center">
        {latestWeight != null && (
          <Metric label={t('dashboard.latestWeight')}>
            {formatWeight(latestWeight, unit, { granularity: 'body' })}
            <Delta value={weightDelta} />
          </Metric>
        )}
        {latestBF != null && (
          <Metric label={t('dashboard.latestBodyFat')}>
            {latestBF}%
            <Delta value={bfDelta} />
          </Metric>
        )}
        {todaySteps != null && (
          <Metric label={t('body.steps')}>{todaySteps.toLocaleString()}</Metric>
        )}
      </dl>
    </Link>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-elevated py-2">
      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm tabular-nums">{children}</dd>
    </div>
  );
}

/** Η μεταβολή ως βέλος + νούμερο — κατεύθυνση χωρίς χρωματικό «καλό/κακό». */
function Delta({ value }: { value: number | null }) {
  if (value == null || value === 0) return null;
  return (
    <span className="ml-1 inline-flex items-center text-xs text-muted-foreground">
      {value > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
      {Math.abs(Math.round(value * 10) / 10)}
    </span>
  );
}
