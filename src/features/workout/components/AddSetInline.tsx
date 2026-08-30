import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { BUILTIN_SET_TYPES, type SetType, type WeightUnit } from '@/lib/db/types';
import { parseWeightToKg, toDisplayWeight } from '@/lib/units';

/** Προαιρετική ένταση — δίπλα στο βάρος λέει ΠΟΣΟ κόστισε το σετ. */
export interface SetIntensity {
  rpe: number | null;
  rir: number | null;
  tempo: string | null;
}

const SET_TYPES: readonly SetType[] = BUILTIN_SET_TYPES;

/** Ετικέτα ενός set type — builtin μεταφράζεται, custom δείχνεται ως έχει. */
function setTypeLabel(st: SetType, t: (k: string) => string): string {
  return (BUILTIN_SET_TYPES as readonly string[]).includes(st) ? t(`setType.${st}`) : st;
}

interface AddSetInlineProps {
  weighted: boolean;
  /** Άσκηση skill/isometric (exercise.default_unit === 'sec') — reps γίνεται hold σε δευτερόλεπτα. */
  holdMode?: boolean;
  /** Μονάδα εμφάνισης/εισαγωγής βάρους — η αποθήκευση (onSave) μένει ΠΑΝΤΑ σε kg. */
  unit?: WeightUnit;
  /** ΠΑΝΤΑ σε kg — όπως αποθηκεύεται. */
  initialWeight?: number | null;
  initialReps?: number | null;
  initialHoldSeconds?: number | null;
  onSave: (
    weightKg: number | null,
    reps: number | null,
    holdSeconds: number | null,
    intensity: SetIntensity,
  ) => Promise<void> | void;
  onCancel?: () => void;
  saveLabelKey?: 'workout.addSet' | 'workout.save';
  /** «Προηγ: 42.5kg × 8» — chip πάνω από τα πεδία (tap = ξανα-γέμισμα). */
  lastLabel?: string | null;
  /** Όταν δίνεται, εμφανίζεται ο επιλογέας τύπου σετ (μόνο κατά την προσθήκη — όχι στο edit). */
  setType?: SetType;
  onSetTypeChange?: (type: SetType) => void;
}

export function AddSetInline({
  weighted,
  holdMode = false,
  unit = 'kg',
  initialWeight,
  initialReps,
  initialHoldSeconds,
  onSave,
  onCancel,
  saveLabelKey = 'workout.addSet',
  lastLabel,
  setType,
  onSetTypeChange,
}: AddSetInlineProps) {
  const { t } = useTranslation();
  const [weight, setWeight] = useState<string>(
    initialWeight != null ? String(toDisplayWeight(initialWeight, unit)) : '',
  );
  const [reps, setReps] = useState<string>(
    initialReps != null ? String(initialReps) : '',
  );
  const [hold, setHold] = useState<string>(
    initialHoldSeconds != null ? String(initialHoldSeconds) : '',
  );
  const [busy, setBusy] = useState(false);
  // Κρυμμένα πίσω από toggle: στο γυμναστήριο η γρήγορη καταγραφή δεν πρέπει
  // να επιβραδύνεται από πεδία που συμπληρώνονται σπάνια.
  const [showIntensity, setShowIntensity] = useState(false);
  const [rpe, setRpe] = useState('');
  const [rir, setRir] = useState('');
  const [tempo, setTempo] = useState('');
  const [customOpen, setCustomOpen] = useState(false);
  const [customType, setCustomType] = useState('');
  // Μετά το save ξαναπαίρνει focus το reps/hold πεδίο — γρήγορη σειριακή
  // καταγραφή σετ-σετ χωρίς tap στο πληκτρολόγιο κάθε φορά.
  const primaryInputRef = useRef<HTMLInputElement>(null);

  const numOrNull = (s: string) => {
    const v = Number(s);
    return s.trim() !== '' && Number.isFinite(v) ? v : null;
  };

  const repsNum = reps.trim() === '' ? null : Number(reps);
  const holdNum = hold.trim() === '' ? null : Number(hold);
  const weightNum = weight.trim() === '' ? null : Number(weight);
  const repsValid = repsNum != null && Number.isFinite(repsNum) && repsNum > 0;
  const holdValid = holdNum != null && Number.isFinite(holdNum) && holdNum > 0;
  const weightValid =
    !weighted || (weightNum != null && Number.isFinite(weightNum) && weightNum >= 0);
  const valid = (holdMode ? holdValid : repsValid) && weightValid;

  const submit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      await onSave(
        weighted && weightNum != null ? parseWeightToKg(weightNum, unit) : null,
        holdMode ? null : repsNum,
        holdMode ? holdNum : null,
        {
          rpe: numOrNull(rpe),
          rir: numOrNull(rir),
          tempo: tempo.trim() === '' ? null : tempo.trim(),
        },
      );
      // Το βάρος συνήθως μένει ίδιο σετ-σετ (π.χ. ίδιο κιλό, διαφορετικά reps
      // λόγω κόπωσης) — ΔΕΝ το σβήνουμε, μόνο τα reps/hold που αλλάζουν.
      setReps('');
      setHold('');
      setRpe('');
      setRir('');
      // Το tempo συνήθως επαναλαμβάνεται μέσα στην ίδια άσκηση — δεν το σβήνουμε.
      primaryInputRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      {lastLabel && (
        <button
          type="button"
          onClick={() => {
            if (initialWeight != null) setWeight(String(toDisplayWeight(initialWeight, unit)));
            if (holdMode) {
              if (initialHoldSeconds != null) setHold(String(initialHoldSeconds));
            } else if (initialReps != null) {
              setReps(String(initialReps));
            }
          }}
          className="text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {lastLabel}
        </button>
      )}
      {onSetTypeChange && (
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('workout.setType')}>
          {/* Το τρέχον custom type (αν δεν είναι builtin) εμφανίζεται πρώτο ως ενεργό chip */}
          {!(BUILTIN_SET_TYPES as readonly string[]).includes(setType ?? 'normal') && setType && (
            <button
              type="button"
              role="radio"
              aria-checked
              className="rounded-full border border-border bg-primary px-2.5 py-1 text-[11px] font-medium text-primary-foreground"
            >
              {setType}
            </button>
          )}
          {SET_TYPES.map((st) => (
            <button
              key={st}
              type="button"
              role="radio"
              aria-checked={setType === st}
              onClick={() => onSetTypeChange(st)}
              className={cn(
                'rounded-full border border-border px-2.5 py-1 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                setType === st
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent',
              )}
            >
              {setTypeLabel(st, t)}
            </button>
          ))}
          {customOpen ? (
            <Input
              autoFocus
              value={customType}
              onChange={(e) => setCustomType(e.target.value)}
              onBlur={() => {
                const v = customType.trim();
                if (v) onSetTypeChange(v);
                setCustomOpen(false);
                setCustomType('');
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') e.currentTarget.blur();
                if (e.key === 'Escape') {
                  setCustomOpen(false);
                  setCustomType('');
                }
              }}
              placeholder={t('setType.customPlaceholder')}
              className="h-7 w-28 text-[11px]"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              aria-label={t('setType.custom')}
              className="rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              +
            </button>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        {weighted && (
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('common.weight')} ({t(`common.${unit}`)})
            </span>
            <Input
              inputMode="decimal"
              type="number"
              step="0.5"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-9 font-mono tabular-nums"
              aria-label={`${t('common.weight')} (${t(`common.${unit}`)})`}
            />
          </label>
        )}
        {holdMode ? (
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('workout.holdSeconds')}
            </span>
            <Input
              ref={primaryInputRef}
              inputMode="numeric"
              type="number"
              min="1"
              step="1"
              value={hold}
              onChange={(e) => setHold(e.target.value)}
              className="h-9 font-mono tabular-nums"
              aria-label={t('workout.holdSeconds')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid) void submit();
              }}
            />
          </label>
        ) : (
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('workout.reps')}
            </span>
            <Input
              ref={primaryInputRef}
              inputMode="numeric"
              type="number"
              min="1"
              step="1"
              value={reps}
              onChange={(e) => setReps(e.target.value)}
              className="h-9 font-mono tabular-nums"
              aria-label={t('workout.reps')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && valid) void submit();
              }}
            />
          </label>
        )}
        <Button
          size="sm"
          disabled={!valid || busy}
          onClick={() => void submit()}
          className="h-9 shrink-0"
        >
          {t(saveLabelKey)}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-9 shrink-0">
            {t('common.cancel')}
          </Button>
        )}
      </div>

      <button
        type="button"
        aria-expanded={showIntensity}
        onClick={() => setShowIntensity((v) => !v)}
        className="text-[11px] text-muted-foreground underline-offset-2 hover:underline"
      >
        {showIntensity ? t('workout.intensityHide') : t('workout.intensityShow')}
      </button>

      {showIntensity && (
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('workout.rpe')}
            </span>
            <Input
              inputMode="decimal"
              type="number"
              step="0.5"
              min="1"
              max="10"
              value={rpe}
              onChange={(e) => setRpe(e.target.value)}
              className="h-9 font-mono tabular-nums"
              aria-label={t('workout.rpe')}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('workout.rir')}
            </span>
            <Input
              inputMode="numeric"
              type="number"
              step="1"
              min="0"
              value={rir}
              onChange={(e) => setRir(e.target.value)}
              className="h-9 font-mono tabular-nums"
              aria-label={t('workout.rir')}
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('workout.tempo')}
            </span>
            <Input
              value={tempo}
              onChange={(e) => setTempo(e.target.value)}
              placeholder="3-1-1-0"
              className="h-9 font-mono"
              aria-label={t('workout.tempo')}
            />
          </label>
        </div>
      )}
    </div>
  );
}
