import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Minus, TrendingDown, TrendingUp } from 'lucide-react';
import { getVolumeTrend } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { toDisplayWeight } from '@/lib/units';
import { ProgressRing } from '@/components/ui/ProgressRing';
import { cn } from '@/lib/utils';

/**
 * Όγκος αυτής της εβδομάδας σε σχέση με την προηγούμενη.
 *
 * 14 μέρες δεδομένων: οι πρώτες 7 = περασμένη εβδομάδα, οι επόμενες 7 = τώρα.
 * Ο δακτύλιος συγκρίνει με πραγματικό μέγεθος (την περασμένη εβδομάδα), όχι
 * με εφευρεμένο στόχο — αν θέλεις στόχο, τον ορίζεις εσύ στους Στόχους.
 */
export function WeeklyVolumeCard() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const trend14 = useLiveQuery(() => getVolumeTrend(14), [], []);

  const thisWeekKg = trend14.slice(7).reduce((a, p) => a + p.volume, 0);
  const lastWeekKg = trend14.slice(0, 7).reduce((a, p) => a + p.volume, 0);
  if (thisWeekKg === 0 && lastWeekKg === 0) return null;

  // Ποσοστό: αναλλοίωτο ως προς τη μονάδα — υπολογίζεται πριν τη μετατροπή.
  const delta = thisWeekKg - lastWeekKg;
  const deltaPct = lastWeekKg > 0 ? Math.round((delta / lastWeekKg) * 100) : null;

  const thisWeek = toDisplayWeight(thisWeekKg, unit, 'plate');
  const lastWeek = toDisplayWeight(lastWeekKg, unit, 'plate');

  return (
    <div className="rounded-xl bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('dashboard.weeklyVolume')}
        </h2>
        {deltaPct != null && (
          // Κατεύθυνση = βέλος, μέγεθος = mono νούμερο — μηδέν off-palette
          // χρώμα (Carbon: no emerald/amber). Το βέλος ΕΙΝΑΙ το νόημα.
          <span
            className={cn(
              'flex items-center gap-1 font-mono text-xs',
              delta === 0 ? 'text-muted-foreground' : 'text-foreground',
            )}
          >
            {delta > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : delta < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
            {delta > 0 ? '+' : ''}
            {deltaPct}%
          </span>
        )}
      </div>

      <div className="mt-2 flex items-center justify-between gap-4">
        <div>
          <p className="font-mono text-3xl leading-none">
            {Math.round(thisWeek / 1000)}
            <span className="text-lg text-muted-foreground">k</span>{' '}
            <span className="font-sans text-xs text-muted-foreground">
              {unit} · {t('dashboard.thisWeek')}
            </span>
          </p>
          <p className="mt-1.5 text-xs text-muted-foreground">
            {t('dashboard.vsLastWeek')}: {Math.round(lastWeek / 1000)}k {unit}
          </p>
        </div>
        {lastWeek > 0 && (
          <ProgressRing
            value={Math.min(thisWeek, lastWeek)}
            max={lastWeek}
            size={76}
            thickness={7}
            label={`${Math.round((thisWeek / lastWeek) * 100)}%`}
            sub={t('dashboard.ofLastWeek')}
          />
        )}
      </div>
    </div>
  );
}
