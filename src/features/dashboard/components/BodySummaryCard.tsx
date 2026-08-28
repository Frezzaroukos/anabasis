import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getBodyMetric, getBodyTrend, localDay } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight, toDisplayWeight } from '@/lib/units';
import { SectionTitle } from '@/components/ui/Section';
import { cn } from '@/lib/utils';

/** Βάρος / λίπος / ισοζύγιο θερμίδων — μόνο ό,τι έχει καταγραφεί. */
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
  // Η μετατροπή είναι γραμμική (χωρίς offset), άρα σωστή και για διαφορές.
  const weightDelta = weightDeltaKg != null ? toDisplayWeight(weightDeltaKg, unit, 'body') : null;

  const bf = trend.filter((p) => p.bodyFatPct != null);
  const latestBF = bf.at(-1)?.bodyFatPct ?? null;
  const firstBF = bf[0]?.bodyFatPct ?? null;
  const bfDelta = latestBF != null && firstBF != null ? latestBF - firstBF : null;

  const balance =
    todayMetric?.calories_in != null && todayMetric?.calories_out != null
      ? todayMetric.calories_in - todayMetric.calories_out
      : null;

  if (latestWeight == null && latestBF == null && balance == null) return null;

  return (
    <Link
      to="/body"
      className="block rounded-xl bg-card p-4 transition-colors duration-200 hover:bg-elevated"
    >
      <SectionTitle action={<span className="text-muted-foreground">→</span>}>
        {t('body.title')}
      </SectionTitle>
      <dl className="grid grid-cols-2 gap-2 text-center">
        {latestWeight != null && (
          <Metric label={t('dashboard.latestWeight')}>
            {formatWeight(latestWeight, unit, { granularity: 'body' })}
            <Delta value={weightDelta} goodWhenNegative />
          </Metric>
        )}
        {latestBF != null && (
          <Metric label={t('dashboard.latestBodyFat')}>
            {latestBF}%
            <Delta value={bfDelta} goodWhenNegative />
          </Metric>
        )}
        {balance != null && (
          <Metric label={t('dashboard.todayBalance')}>
            <span className={cn(balance >= 0 ? 'text-amber-400' : 'text-emerald-400')}>
              {balance > 0 ? '+' : ''}
              {balance} kcal
            </span>
          </Metric>
        )}
      </dl>
    </Link>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md bg-elevated py-2">
      <dt className="text-[10px] uppercase text-muted-foreground">{label}</dt>
      <dd className="font-mono text-sm">{children}</dd>
    </div>
  );
}

/**
 * Η μεταβολή σε παρένθεση. `goodWhenNegative`: στο βάρος/λίπος η ΠΤΩΣΗ είναι
 * συνήθως ο στόχος — αντίθετα από τον όγκο προπόνησης. Κάθε μετρική κρατά
 * το δικό της πρόσημο «καλού», δεν υπάρχει καθολικό «πράσινο = πάνω».
 */
function Delta({ value, goodWhenNegative }: { value: number | null; goodWhenNegative?: boolean }) {
  if (value == null || value === 0) return null;
  const good = goodWhenNegative ? value < 0 : value > 0;
  return (
    <span className={cn('ml-1 text-xs', good ? 'text-emerald-400' : 'text-amber-400')}>
      ({value > 0 ? '+' : ''}
      {Math.round(value * 10) / 10})
    </span>
  );
}
