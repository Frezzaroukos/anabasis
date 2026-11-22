import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { adjustExerciseSetWeights } from '@/lib/db/queries';
import { parseWeightToKg } from '@/lib/units';
import type { WeightUnit } from '@/lib/db/types';
import { cn } from '@/lib/utils';

/**
 * Αλλαγή βάρους σε ΟΛΑ τα working σετ μιας άσκησης σε μια προπόνηση, με ένα
 * κίνημα — «ήταν 20kg, όχι 25». Δύο τρόποι: πρόσθεσε/αφαίρεσε (delta) ή όρισε
 * σταθερό βάρος. Τα PR ξαναϋπολογίζονται στο query. Οι τιμές εισάγονται στη
 * μονάδα του χρήστη· η αποθήκευση γίνεται σε kg μέσω parseWeightToKg.
 */
export function BatchWeightSheet({
  open,
  onClose,
  workoutId,
  exerciseId,
  exerciseName,
  unit,
  onApplied,
}: {
  open: boolean;
  onClose: () => void;
  workoutId: string;
  exerciseId: string;
  exerciseName: string;
  unit: WeightUnit;
  onApplied: (count: number) => void;
}) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'delta' | 'absolute'>('delta');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);

  const num = (() => {
    const cleaned = value.trim().replace(',', '.');
    if (cleaned === '') return null;
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : null;
  })();

  const apply = async () => {
    if (num == null || busy) return;
    setBusy(true);
    try {
      // Είσοδος στη μονάδα του χρήστη → kg για αποθήκευση (ίδια σύμβαση με τον logger).
      const kg = parseWeightToKg(Math.abs(num), unit);
      const res = await adjustExerciseSetWeights(
        workoutId,
        exerciseId,
        mode === 'delta' ? { deltaKg: num < 0 ? -kg : kg } : { absoluteKg: kg },
      );
      onApplied(res.updated);
      setValue('');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('history.batchWeightTitle')}>
      <div className="space-y-4 px-4 pb-6">
        <p className="text-sm text-muted-foreground">
          {t('history.batchWeightDesc', { name: exerciseName })}
        </p>

        <div role="tablist" className="flex rounded-md bg-elevated p-0.5 text-xs font-medium">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'delta'}
            onClick={() => setMode('delta')}
            className={cn(
              'flex-1 rounded px-2 py-1.5 transition-colors',
              mode === 'delta' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {t('history.batchWeightDelta')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'absolute'}
            onClick={() => setMode('absolute')}
            className={cn(
              'flex-1 rounded px-2 py-1.5 transition-colors',
              mode === 'absolute' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground',
            )}
          >
            {t('history.batchWeightAbsolute')}
          </button>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {mode === 'delta' ? t('history.batchWeightDelta') : t('history.batchWeightAbsolute')} ({unit})
          </span>
          <Input
            type="number"
            inputMode="decimal"
            step="0.5"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={mode === 'delta' ? '-5' : '20'}
            className="h-11 font-mono tabular-nums"
            aria-label={t('history.batchWeightTitle')}
          />
          {mode === 'delta' && (
            <span className="text-xs text-muted-foreground">−5 / +5</span>
          )}
        </label>

        <Button className="w-full" disabled={num == null || busy} onClick={() => void apply()}>
          {t('history.batchWeightApply')}
        </Button>
      </div>
    </BottomSheet>
  );
}
