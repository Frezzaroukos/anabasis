import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useAppSettings } from '@/hooks/useAppSettings';
import { toDisplayWeight } from '@/lib/units';
import type { WeightUnit } from '@/lib/db/types';

/** Στάνταρ βάρη δισκάκια σε kg, από το μεγαλύτερο στο μικρότερο. */
export const STANDARD_PLATES_KG = [25, 20, 15, 10, 5, 2.5, 1.25] as const;

/**
 * Στάνταρ σετ δισκαριών σε lb (αμερικάνικο γυμναστήριο) — ΔΕΝ είναι
 * μετατροπή του kg σετ, είναι το δικό του φυσικό σύνολο δισκαριών.
 */
export const STANDARD_PLATES_LB = [45, 35, 25, 10, 5, 2.5] as const;

/** Προεπιλεγμένο βάρος μπάρας (Olympic barbell). */
export const DEFAULT_BAR_KG = 20;

/** Προεπιλεγμένο βάρος μπάρας σε lb (τυπική αμερικάνικη μπάρα 45lb). */
export const DEFAULT_BAR_LB = 45;

export interface PlateBreakdownItem {
  plate: number;
  count: number;
}

export interface PlateCalculationResult {
  /** Βάρος ανά πλευρά (πριν στρογγυλοποίηση σε διαθέσιμα δισκάκια). */
  perSide: number;
  plates: PlateBreakdownItem[];
  /** Kg ανά πλευρά που δεν καλύπτονται από τα διαθέσιμα δισκάκια (π.χ. στόχος όχι πολλαπλάσιο του 1.25). */
  remainder: number;
}

const EPSILON = 1e-6;

/**
 * Greedy υπολογισμός δισκάκια ανά πλευρά: (target - bar) / 2, μετά γεμίζει
 * από το μεγαλύτερο διαθέσιμο δισκάκι προς το μικρότερο. Pure function —
 * εξάγεται και για unit test, εξ ου και το eslint-disable παρακάτω (ίδιο
 * pattern με buttonVariants στο ui/button.tsx).
 */
// eslint-disable-next-line react-refresh/only-export-components
export function calculatePlates(
  targetKg: number,
  barKg: number,
  availablePlates: readonly number[] = STANDARD_PLATES_KG,
): PlateCalculationResult {
  const perSide = (targetKg - barKg) / 2;
  if (!(perSide > 0) || !Number.isFinite(perSide)) {
    return { perSide: 0, plates: [], remainder: 0 };
  }

  let remaining = perSide;
  const plates: PlateBreakdownItem[] = [];
  for (const plate of availablePlates) {
    if (!(plate > 0)) continue;
    let count = 0;
    while (remaining + EPSILON >= plate) {
      remaining -= plate;
      count += 1;
    }
    if (count > 0) plates.push({ plate, count });
  }

  return {
    perSide,
    plates,
    remainder: Math.max(0, Math.round(remaining * 1000) / 1000),
  };
}

/**
 * Χρώμα ανά δισκάκι — σύμβαση γυμναστηρίου (IPF-style για kg· 45/35 lb
 * προστέθηκαν για το lb σετ, δεν συνυπάρχουν ποτέ με τα 20/15 kg).
 */
const PLATE_COLOR_CLASS: Record<number, string> = {
  45: 'bg-blue-500 text-white',
  35: 'bg-yellow-400 text-black',
  25: 'bg-red-500 text-white',
  20: 'bg-blue-500 text-white',
  15: 'bg-yellow-400 text-black',
  10: 'bg-emerald-500 text-white',
  5: 'bg-zinc-100 text-black',
  2.5: 'bg-zinc-900 text-white border border-zinc-600',
  1.25: 'bg-zinc-400 text-black',
};

/** Οπτικό μέγεθος δισκαριού — μεγαλύτερο βάρος = μεγαλύτερος κύκλος. */
const PLATE_SIZE_CLASS: Record<number, string> = {
  45: 'h-16 w-16 text-sm',
  35: 'h-14 w-14 text-sm',
  25: 'h-16 w-16 text-sm',
  20: 'h-14 w-14 text-sm',
  15: 'h-12 w-12 text-xs',
  10: 'h-11 w-11 text-xs',
  5: 'h-10 w-10 text-xs',
  2.5: 'h-9 w-9 text-[10px]',
  1.25: 'h-8 w-8 text-[10px]',
};

interface PlateCalculatorProps {
  /** Αρχικός στόχος βάρους σε kg (π.χ. προγεμισμένο από ένα υπάρχον σετ). */
  initialTargetKg?: number | null;
  /** Αρχικό βάρος μπάρας σε kg. undefined = προεπιλογή ανάλογα με τη μονάδα (20kg/45lb). */
  initialBarKg?: number;
  className?: string;
}

/**
 * Αυτόνομος υπολογιστής δισκαριών: δίνεις στόχο + βάρος μπάρας, δείχνει τι
 * δισκάκια βάζεις ανά πλευρά. Καθαρός υπολογισμός (greedy) + οπτική στοίβα.
 *
 * Η μονάδα (kg/lb) έρχεται από τις ρυθμίσεις — σε lb χρησιμοποιεί το δικό
 * του, φυσικό σετ δισκαριών (45/35/25/10/5/2.5) και μπάρα 45lb, ΟΧΙ
 * μετατροπή του kg σετ (τα δισκάκια lb είναι διαφορετικά φυσικά αντικείμενα).
 */
export function PlateCalculator({
  initialTargetKg = null,
  initialBarKg,
  className,
}: PlateCalculatorProps) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit: WeightUnit = settings?.weight_unit ?? 'kg';
  const plates = unit === 'lb' ? STANDARD_PLATES_LB : STANDARD_PLATES_KG;

  const [target, setTarget] = useState<string>(
    initialTargetKg != null ? String(toDisplayWeight(initialTargetKg, unit)) : '',
  );
  const [bar, setBar] = useState<string>(
    initialBarKg != null
      ? String(toDisplayWeight(initialBarKg, unit))
      : String(unit === 'lb' ? DEFAULT_BAR_LB : DEFAULT_BAR_KG),
  );

  const targetNum = Number(target);
  const barNum = Number(bar);

  const result = useMemo(() => {
    if (!Number.isFinite(targetNum) || !Number.isFinite(barNum)) {
      return calculatePlates(0, 0, plates);
    }
    return calculatePlates(targetNum, barNum, plates);
  }, [targetNum, barNum, plates]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('plate.target')} ({t(`common.${unit}`)})
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="font-mono tabular-nums"
          />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          {t('plate.bar')} ({t(`common.${unit}`)})
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.5}
            value={bar}
            onChange={(e) => setBar(e.target.value)}
            className="font-mono tabular-nums"
          />
        </label>
      </div>

      {result.plates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('plate.empty', 'Enter a target weight higher than the bar.')}
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {t('plate.perSide', 'Per side')}:{' '}
            <span className="font-mono font-medium tabular-nums text-foreground">
              {result.perSide}{unit}
            </span>
          </p>

          <div className="flex flex-wrap items-end gap-2" role="list" aria-label={t('plate.perSide', 'Per side')}>
            {result.plates.map(({ plate, count }) =>
              Array.from({ length: count }, (_, i) => (
                <div
                  key={`${plate}-${i}`}
                  role="listitem"
                  className={cn(
                    'flex shrink-0 items-center justify-center rounded-full font-mono font-semibold tabular-nums',
                    PLATE_SIZE_CLASS[plate] ?? 'h-10 w-10 text-xs',
                    PLATE_COLOR_CLASS[plate] ?? 'bg-secondary text-secondary-foreground',
                  )}
                >
                  {plate}
                </div>
              )),
            )}
          </div>

          {result.remainder > 0 && (
            <p className="text-xs text-muted-foreground">
              {t('plate.remainder', "Doesn't divide evenly — {{amount}}{{unit}} per side left over.", {
                amount: result.remainder,
                unit,
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
