import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  formatLength,
  lengthUnitFor,
  parseLengthToCm,
  toDisplayLength,
} from '@/lib/units';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { WeightUnit } from '@/lib/db/types';
import {
  MEASUREMENT_FIELDS,
  isValidMeasurementInput,
  presentMeasurements,
  type MeasurementField,
} from './bodyMeasurements';

export interface MeasurementsFormProps {
  /** Τρέχουσες τιμές σε cm (null = κενό). */
  values: Record<MeasurementField, number | null>;
  weightUnit: WeightUnit;
  onChange: (next: Record<MeasurementField, number | null>) => void;
}

/**
 * Η φόρμα των 8 περιφερειών — grid 2 στηλών (mobile 320px), label + unit per
 * input, inputMode=decimal. Το validation σημαίνει aria-invalid + σφάλμα.
 */
export function MeasurementsForm({ values, weightUnit, onChange }: MeasurementsFormProps) {
  const { t } = useTranslation();
  const unit = lengthUnitFor(weightUnit);
  // Κρατάμε το string ως έχει (ο χρήστης μπορεί να πληκτρολογεί «82.»).
  const [text, setText] = useState<Record<MeasurementField, string>>(() => {
    const out = {} as Record<MeasurementField, string>;
    for (const { key } of MEASUREMENT_FIELDS) {
      out[key] = values[key] != null ? String(toDisplayLength(values[key]!, unit)) : '';
    }
    return out;
  });

  // Ο γονιός φορτώνει τις τιμές ασύγχρονα (liveQuery): στην πρώτη render
  // είναι όλες null και γεμίζουν μετά. Συγχρονίζουμε ΜΟΝΟ τα άδεια πεδία από
  // εξωτερική πηγή ώστε να μη σβήνουμε ό,τι πληκτρολογεί ο χρήστης.
  const dirty = useRef<Set<MeasurementField>>(new Set());
  useEffect(() => {
    setText((cur) => {
      let changed = false;
      const next = { ...cur };
      for (const { key } of MEASUREMENT_FIELDS) {
        if (dirty.current.has(key)) continue;
        const want = values[key] != null ? String(toDisplayLength(values[key]!, unit)) : '';
        if (next[key] !== want) {
          next[key] = want;
          changed = true;
        }
      }
      return changed ? next : cur;
    });
  }, [values, unit]);

  const num = (s: string): number | null => {
    const cleaned = s.trim().replace(',', '.');
    if (cleaned === '') return null;
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : null;
  };

  const commit = (key: MeasurementField, raw: string) => {
    const v = num(raw);
    onChange({
      ...values,
      [key]: v == null ? null : parseLengthToCm(v, unit),
    });
  };

  return (
    <div className="grid grid-cols-2 gap-2">
      {MEASUREMENT_FIELDS.map(({ key, labelKey }) => {
        const raw = text[key];
        const v = num(raw);
        const invalid = raw.trim() !== '' && (v == null || !isValidMeasurementInput(v, unit));
        const errId = `meas-${key}-err`;
        return (
          <label key={key} className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              {t(labelKey)} ({unit})
            </span>
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.1"
              value={raw}
              aria-label={`${t(labelKey)} (${unit})`}
              aria-invalid={invalid}
              aria-describedby={invalid ? errId : undefined}
              onChange={(e) => {
                dirty.current.add(key);
                setText((cur) => ({ ...cur, [key]: e.target.value }));
                commit(key, e.target.value);
              }}
              className={cn('h-9 font-mono tabular-nums')}
            />
            {invalid && (
              <span id={errId} role="alert" className="mt-0.5 block text-[11px] text-destructive">
                {t('body.invalidMeasurement')}
              </span>
            )}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Σύνοψη περιφερειών μιας καταχώρισης — δείχνει όσες έχουν τιμή, με τη
 * μονάδα του χρήστη. Compact ώστε να χωρά στα 320px.
 */
export function MeasurementsSummary({
  entry,
  weightUnit,
}: {
  entry: Partial<Record<MeasurementField, number | null>>;
  weightUnit: WeightUnit;
}) {
  const { t } = useTranslation();
  const unit = lengthUnitFor(weightUnit);
  const present = presentMeasurements(entry);
  if (present.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-x-2 gap-y-0.5">
      {present.map(({ key, labelKey, value }) => (
        <li key={key} className="font-mono text-xs tabular-nums text-muted-foreground">
          {t(labelKey)} {formatLength(value, unit)}
        </li>
      ))}
    </ul>
  );
}
