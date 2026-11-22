import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check } from 'lucide-react';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { getBodyMetric, getLatestBodyweight, localDay, saveBodyMetric } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { parseWeightToKg } from '@/lib/units';
import { WeightStepper } from '@/features/body/WeightStepper';
import { formatDisplayWeight, parseDisplayWeight } from '@/features/body/weightEntry';

/**
 * Βάρος από την Αρχική: ανοίγει με την τελευταία τιμή ήδη μέσα.
 * Δεύτερο πάτημα = Αποθήκευση, χωρίς να περάσεις από Περισσότερα → Σώμα.
 */
export function QuickWeightSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const labelId = useId();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const today = localDay();
  const todayMetric = useLiveQuery(
    async () => (open ? ((await getBodyMetric(today)) ?? null) : null),
    [open, today],
  );
  const latestKg = useLiveQuery(
    () => (open ? getLatestBodyweight(today) : Promise.resolve(null)),
    [open, today],
  );
  const [value, setValue] = useState('');
  const [suggested, setSuggested] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSaved(false);
    if (todayMetric === undefined || latestKg === undefined) return;
    if (todayMetric?.weight_kg != null) {
      setValue(formatDisplayWeight(todayMetric.weight_kg, unit));
      setSuggested(false);
      return;
    }
    if (latestKg != null) {
      setValue(formatDisplayWeight(latestKg, unit));
      setSuggested(true);
      return;
    }
    setValue('');
    setSuggested(false);
  }, [open, todayMetric, latestKg, unit]);

  const save = async () => {
    const display = parseDisplayWeight(value);
    if (display == null) return;
    await saveBodyMetric(today, { weight_kg: parseWeightToKg(display, unit) });
    setSuggested(false);
    setSaved(true);
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('dashboard.logWeightTitle')}>
      <div className="space-y-3 px-4 pb-4">
        <p id={labelId} className="text-xs uppercase tracking-wide text-muted-foreground">
          {t('body.weight')} ({unit})
        </p>
        <WeightStepper value={value} unit={unit} labelledBy={labelId} onChange={setValue} />
        {suggested && (
          <p className="text-xs text-muted-foreground">{t('body.prefilledFromLast')}</p>
        )}
        <div className="flex items-center gap-2">
          <Button className="h-11" disabled={parseDisplayWeight(value) == null} onClick={() => void save()}>
            {t('body.save')}
          </Button>
          {saved && (
            <span className="flex items-center gap-1 text-xs font-medium text-primary" role="status">
              <Check className="h-3.5 w-3.5" aria-hidden />
              {t('body.saved')}
            </span>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
