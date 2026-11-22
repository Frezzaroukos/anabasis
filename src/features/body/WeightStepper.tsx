import { useTranslation } from 'react-i18next';
import type { WeightUnit } from '@/lib/db/types';
import { Input } from '@/components/ui/input';
import { stepDisplayWeight } from './weightEntry';

/**
 * Πεδίο βάρους με − / + στο βήμα της ζυγαριάς.
 * Τα κουμπιά είναι 44px — το σκέτο input σε κινητό έπιανε λάθος ψηφίο.
 */
export function WeightStepper({
  value,
  unit,
  labelledBy,
  onChange,
}: {
  value: string;
  unit: WeightUnit;
  labelledBy: string;
  onChange: (next: string) => void;
}) {
  const { t } = useTranslation();
  const nudge = (direction: -1 | 1) => onChange(stepDisplayWeight(value, direction, unit));

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={t('body.decreaseWeight')}
        onClick={() => nudge(-1)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-lg text-foreground ring-offset-background transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        −
      </button>
      <Input
        type="number"
        inputMode="decimal"
        aria-labelledby={labelledBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-11 flex-1 font-mono tabular-nums"
      />
      <button
        type="button"
        aria-label={t('body.increaseWeight')}
        onClick={() => nudge(1)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-border bg-background text-lg text-foreground ring-offset-background transition-colors hover:bg-accent focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        +
      </button>
    </div>
  );
}
