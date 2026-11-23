import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { isCoarsePointer } from '@/lib/touch';
import { useKeepAboveKeyboard } from '@/hooks/useKeepAboveKeyboard';
import { StepperField } from './StepperField';
import { BUILTIN_SET_TYPES, type SetType, type WeightUnit } from '@/lib/db/types';
import { parseWeightToKg, toDisplayWeight } from '@/lib/units';

/** Προαιρετική ένταση & σημείωση — δίπλα στο βάρος λέει ΠΟΣΟ κόστισε το σετ. */
export interface SetIntensity {
  rpe: number | null;
  rir: number | null;
  tempo: string | null;
  notes?: string | null;
}

const SET_TYPES: readonly SetType[] = BUILTIN_SET_TYPES;

/** Έγκυρες επαναλήψεις: θετικός αριθμός έως 2 δεκαδικά (επιτρέπει μισές επαναλήψεις όπως 2.5). */
function isValidReps(n: number | null): n is number {
  if (n == null || !Number.isFinite(n) || n <= 0) return false;
  return Math.abs(Math.round(n * 100) - n * 100) < 1e-6;
}

// Λογικά ανώτατα όρια: ένα «250 reps»/«5000 kg» είναι σχεδόν σίγουρα λάθος
// πληκτρολόγηση (κολλημένο μηδέν) και μολύνει όγκο/PR/e1RM. Δεν τα
// απορρίπτουμε σιωπηλά — τα σημαδεύουμε άκυρα ώστε να μη μπορεί να σωθούν.
const MAX_REPS = 1000;
const MAX_HOLD_SECONDS = 7200;
const MAX_WEIGHT_KG = 1000;
const HOLD_STEP_SECONDS = 5;

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
  initialRestPauseReps?: number[];
  initialRpe?: number | null;
  initialRir?: number | null;
  initialTempo?: string | null;
  initialNotes?: string | null;
  onSave: (
    weightKg: number | null,
    reps: number | null,
    holdSeconds: number | null,
    intensity: SetIntensity,
    restPauseReps: number[],
  ) => Promise<void> | void;
  onCancel?: () => void;
  saveLabelKey?: 'workout.addSet' | 'workout.save';
  /** «Προηγ: 42.5kg × 8» — chip πάνω από τα πεδία (tap = ξανα-γέμισμα). */
  lastLabel?: string | null;
  /** Όταν δίνεται, εμφανίζεται ο επιλογέας τύπου σετ. */
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
  initialRestPauseReps = [],
  initialRpe = null,
  initialRir = null,
  initialTempo = null,
  initialNotes = null,
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
  const [restPauseReps, setRestPauseReps] = useState(initialRestPauseReps.join(', '));
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [saveError, setSaveError] = useState(false);
  const hasInitialDetails =
    initialRpe != null || initialRir != null || Boolean(initialTempo) || Boolean(initialNotes);
  // Κρυμμένα πίσω από toggle: στο γυμναστήριο η γρήγορη καταγραφή δεν πρέπει
  // να επιβραδύνεται από πεδία που συμπληρώνονται σπάνια — ανοιχτά αυτόματα
  // όταν κάνεις edit σε σετ που ήδη έχει ένταση/σημείωση.
  const [showIntensity, setShowIntensity] = useState(hasInitialDetails);
  const [rpe, setRpe] = useState(initialRpe != null ? String(initialRpe) : '');
  const [rir, setRir] = useState(initialRir != null ? String(initialRir) : '');
  const [tempo, setTempo] = useState(initialTempo ?? '');
  const [notes, setNotes] = useState(initialNotes ?? '');
  const [customOpen, setCustomOpen] = useState(false);
  const [customType, setCustomType] = useState('');
  // Μετά το save ξαναπαίρνει focus το reps/hold πεδίο — γρήγορη σειριακή
  // καταγραφή σετ-σετ χωρίς tap στο πληκτρολόγιο κάθε φορά.
  const primaryInputRef = useRef<HTMLInputElement>(null);
  // Γράφεις στο πληκτρολόγιο → το «Προσθήκη set» μένει ορατό πάνω του.
  const formRef = useRef<HTMLFieldSetElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  useKeepAboveKeyboard(formRef, saveRef);
  // Η σειρά τύπων κυλά οριζόντια: αν ο επιλεγμένος (π.χ. «Μισό-hold» σε edit)
  // είναι εκτός οθόνης, φέρ' τον μέσα — αλλιώς δεν ξέρεις τι είναι επιλεγμένο.
  const typeRowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const row = typeRowRef.current;
    const chip = row?.querySelector<HTMLElement>('[aria-checked="true"]');
    if (!row || !chip) return;
    const right = chip.offsetLeft + chip.offsetWidth;
    if (chip.offsetLeft < row.scrollLeft || right > row.scrollLeft + row.clientWidth) {
      row.scrollLeft = Math.max(0, chip.offsetLeft - 8);
    }
  }, [setType]);
  // Σταθερά ids για aria-describedby — ώστε το σφάλμα να «κολλάει» στο πεδίο
  // που το προκάλεσε (screen reader ακούει τον λόγο όταν εστιάζει το input).
  const errorBaseId = useId();
  const weightErrId = `${errorBaseId}-weight-err`;
  const repsErrId = `${errorBaseId}-reps-err`;
  const holdErrId = `${errorBaseId}-hold-err`;
  const rpeErrId = `${errorBaseId}-rpe-err`;
  const rirErrId = `${errorBaseId}-rir-err`;

  const numOrNull = (s: string) => {
    const cleaned = s.trim().replace(',', '.');
    if (cleaned === '') return null;
    const v = Number(cleaned);
    return Number.isFinite(v) ? v : null;
  };

  const repsNum = numOrNull(reps);
  const holdNum = numOrNull(hold);
  const weightNum = numOrNull(weight);
  const allowsBlankReps = setType === 'amrap' || setType === 'failure';
  const repsValid =
    (reps.trim() === '' && allowsBlankReps) ||
    (reps.trim() !== '' && isValidReps(repsNum) && repsNum <= MAX_REPS);
  const holdValid =
    holdNum != null &&
    Number.isSafeInteger(holdNum) &&
    holdNum > 0 &&
    holdNum <= MAX_HOLD_SECONDS;
  // Όριο στο display unit: kg → 1000, lb → ≈2205 (ίδιο φυσικό όριο).
  const maxWeightDisplay = unit === 'lb' ? 2205 : MAX_WEIGHT_KG;
  const weightValid =
    !weighted ||
    (weightNum != null && Number.isFinite(weightNum) && weightNum >= 0 && weightNum <= maxWeightDisplay);
  // Hold-based logging όταν ο caller το ζητά (skill/isometric exercise) Ή όταν
  // ο χρήστης διαλέξει set type που μετριέται σε δευτερόλεπτα (isometric/half_hold).
  const holdActive = holdMode || setType === 'isometric' || setType === 'half_hold';
  const rpeNum = numOrNull(rpe);
  const rirNum = numOrNull(rir);
  const intensityValid =
    (rpe.trim() === '' || (rpeNum != null && rpeNum >= 1 && rpeNum <= 10)) &&
    (rir.trim() === '' || (rirNum != null && Number.isSafeInteger(rirNum) && rirNum >= 0));
  const valid = (holdActive ? holdValid : repsValid) && weightValid && intensityValid;
  const parsedRestPauseReps = restPauseReps
    .split(/[,+\s]+/)
    .filter(Boolean)
    .map((v) => Number(v.replace(',', '.')));
  const restPauseValid =
    setType !== 'rest_pause' ||
    (parsedRestPauseReps.length > 0 && parsedRestPauseReps.every((value) => isValidReps(value)));

  // Εναλλαγή reps↔hold: καθάρισε το πεδίο που μόλις κρύφτηκε ώστε να μη μείνει stale τιμή.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (holdActive) setReps('');
    else setHold('');
    primaryInputRef.current?.focus();
  }, [holdActive]);

  // Οι τιμές «προηγούμενης φοράς» φορτώνονται ασύγχρονα (IndexedDB) — συχνά
  // ΜΕΤΑ το πρώτο render. Αν ο χρήστης δεν έχει αγγίξει το πεδίο, το γεμίζουμε
  // όταν φτάσουν· αν έχει πληκτρολογήσει κάτι, δεν το πατάμε ποτέ.
  const weightDirty = useRef(false);
  const repsDirty = useRef(false);
  const holdDirty = useRef(false);
  useEffect(() => {
    if (!weightDirty.current && initialWeight != null) {
      setWeight(String(toDisplayWeight(initialWeight, unit)));
    }
  }, [initialWeight, unit]);
  useEffect(() => {
    if (!repsDirty.current && !holdActive && initialReps != null) setReps(String(initialReps));
  }, [initialReps, holdActive]);
  useEffect(() => {
    if (!holdDirty.current && holdActive && initialHoldSeconds != null) setHold(String(initialHoldSeconds));
  }, [initialHoldSeconds, holdActive]);

  const bumpWeight = (delta: number) => {
    weightDirty.current = true;
    const cur = weightNum ?? 0;
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    setWeight(String(next));
  };

  const weightStep = unit === 'lb' ? 5 : 2.5;

  /** ±1 επανάληψη· ποτέ κάτω από 1 (0 reps δεν είναι σετ). Κενό + «+» → 1. */
  const bumpReps = (direction: -1 | 1) => {
    const next = Math.round(((repsNum ?? 0) + direction) * 100) / 100;
    if (next <= 0) return;
    repsDirty.current = true;
    setReps(String(next));
  };

  /** ±5 δευτερόλεπτα για holds· ποτέ κάτω από 1s. */
  const bumpHold = (direction: -1 | 1) => {
    const next = Math.round(holdNum ?? 0) + direction * HOLD_STEP_SECONDS;
    if (next <= 0) return;
    holdDirty.current = true;
    setHold(String(next));
  };

  /**
   * `viaKeyboard`: ήρθε από Enter/«Done». Μόνο τότε (ή με ποντίκι) ξαναπαίρνει
   * focus το πεδίο. Σε κινητό, μετά από tap στο κουμπί, ένα focus θα άνοιγε
   * ξανά το πληκτρολόγιο σε κάθε σετ — μισή οθόνη σκεπασμένη ενώ ξεκουράζεσαι.
   */
  const submit = async (viaKeyboard = false) => {
    if (!valid || !restPauseValid || submitting.current) return;
    submitting.current = true;
    setSaveError(false);
    setBusy(true);
    try {
      const trimmedNotes = notes.trim();
      await onSave(
        weighted && weightNum != null ? parseWeightToKg(weightNum, unit) : null,
        holdActive ? null : reps.trim() === '' ? null : Math.round((repsNum ?? 0) * 100) / 100,
        holdActive ? holdNum : null,
        {
          rpe: rpeNum,
          rir: rirNum,
          tempo: tempo.trim() === '' ? null : tempo.trim(),
          notes: trimmedNotes === '' ? null : trimmedNotes,
        },
        setType === 'rest_pause' ? parsedRestPauseReps : [],
      );
      // Βάρος ΚΑΙ reps/hold μένουν σετ-σετ (τυπικά 3×8 στο ίδιο φορτίο = 1 tap
      // ανά σετ)· καθαρίζουν μόνο τα σπάνια πεδία (RPE/RIR/σημείωση) που
      // αφορούν ένα συγκεκριμένο σετ. Το focus επιστρέφει στο reps με επιλεγμένο
      // κείμενο, οπότε το πληκτρολόγιο αντικαθιστά την τιμή αν αλλάξει.
      setRpe('');
      setRir('');
      setNotes('');
    } catch {
      // Keep every entered value intact: a failed write must be visibly retryable.
      setSaveError(true);
    } finally {
      submitting.current = false;
      setBusy(false);
      if (viaKeyboard || !isCoarsePointer()) {
        requestAnimationFrame(() => primaryInputRef.current?.focus());
      }
    }
  };

  return (
    <fieldset ref={formRef} disabled={busy} aria-busy={busy} className="min-w-0 space-y-2">
      {saveError && <p role="alert" className="text-sm text-destructive">{t('workout.saveFailed')}</p>}
      {lastLabel && (
        <button
          type="button"
          onClick={() => {
            if (initialWeight != null) setWeight(String(toDisplayWeight(initialWeight, unit)));
            if (holdActive) {
              if (initialHoldSeconds != null) setHold(String(initialHoldSeconds));
            } else if (initialReps != null) {
              setReps(String(initialReps));
            }
          }}
          className="min-h-11 text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {lastLabel}
        </button>
      )}
      {onSetTypeChange && (
        // Μία γραμμή που κυλά οριζόντια — όχι 4 γραμμές chips (~200px) ΠΑΝΩ από
        // βάρος/επαναλήψεις. Ο τύπος αλλάζει σπάνια· τα πεδία και το «Προσθήκη
        // set» χρησιμοποιούνται σε κάθε σετ, άρα ανεβαίνουν εκεί που φτάνει ο αντίχειρας.
        <div
          ref={typeRowRef}
          className="-mx-2 flex snap-x scroll-px-2 items-center gap-1.5 overflow-x-auto px-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="radiogroup"
          aria-label={t('workout.setType')}
        >
          {/* Το τρέχον custom type (αν δεν είναι builtin) εμφανίζεται πρώτο ως ενεργό chip */}
          {!(BUILTIN_SET_TYPES as readonly string[]).includes(setType ?? 'normal') && setType && (
            <button
              type="button"
              role="radio"
              aria-checked
              className="min-h-11 shrink-0 snap-start whitespace-nowrap rounded-full border border-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
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
                'min-h-11 shrink-0 snap-start whitespace-nowrap rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
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
              className="h-11 w-36 shrink-0"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              aria-label={t('setType.custom')}
              className="min-h-11 min-w-11 shrink-0 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              +
            </button>
          )}
        </div>
      )}
      <div className="flex items-start gap-2">
        {weighted && (
          <StepperField
            label={`${t('common.weight')} (${t(`common.${unit}`)})`}
            decText={`−${weightStep}`}
            incText={`+${weightStep}`}
            decLabel={`−${weightStep} ${t(`common.${unit}`)}`}
            incLabel={`+${weightStep} ${t(`common.${unit}`)}`}
            onStep={(direction) => bumpWeight(direction * weightStep)}
            inputMode="decimal"
            type="number"
            step="0.5"
            min="0"
            value={weight}
            onChange={(e) => {
              weightDirty.current = true;
              setWeight(e.target.value);
            }}
            enterKeyHint="next"
            onFocus={(e) => e.currentTarget.select()}
            aria-label={`${t('common.weight')} (${t(`common.${unit}`)})`}
            aria-invalid={weight.trim() !== '' && !weightValid}
            aria-describedby={weight.trim() !== '' && !weightValid ? weightErrId : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); primaryInputRef.current?.focus(); }
            }}
            error={weight.trim() !== '' && !weightValid && (
              <span id={weightErrId} role="alert" className="text-xs text-destructive">
                {t('workout.invalidWeight')}
              </span>
            )}
          />
        )}
        {holdActive ? (
          <StepperField
            ref={primaryInputRef}
            label={t('workout.holdSeconds')}
            decText={`−${HOLD_STEP_SECONDS}`}
            incText={`+${HOLD_STEP_SECONDS}`}
            decLabel={t('workout.stepHoldDown', { n: HOLD_STEP_SECONDS })}
            incLabel={t('workout.stepHoldUp', { n: HOLD_STEP_SECONDS })}
            onStep={bumpHold}
            inputMode="numeric"
            type="number"
            min="1"
            step="1"
            value={hold}
            onChange={(e) => {
              holdDirty.current = true;
              setHold(e.target.value);
            }}
            enterKeyHint="done"
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t('workout.holdSeconds')}
            aria-invalid={hold.trim() !== '' && !holdValid}
            aria-describedby={hold.trim() !== '' && !holdValid ? holdErrId : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void submit(true); }
            }}
            error={hold.trim() !== '' && !holdValid && (
              <span id={holdErrId} role="alert" className="text-xs text-destructive">
                {t('workout.invalidHold')}
              </span>
            )}
          />
        ) : (
          <StepperField
            ref={primaryInputRef}
            label={t('workout.reps')}
            decText="−1"
            incText="+1"
            decLabel={t('workout.stepRepsDown')}
            incLabel={t('workout.stepRepsUp')}
            onStep={bumpReps}
            inputMode="decimal"
            type="number"
            min="0.5"
            step="any"
            value={reps}
            placeholder={allowsBlankReps ? t('workout.amrapPlaceholder') : undefined}
            onChange={(e) => {
              repsDirty.current = true;
              setReps(e.target.value);
            }}
            enterKeyHint="done"
            onFocus={(e) => e.currentTarget.select()}
            aria-label={t('workout.reps')}
            aria-invalid={reps.trim() !== '' && !repsValid}
            aria-describedby={reps.trim() !== '' && !repsValid ? repsErrId : undefined}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void submit(true); }
            }}
            error={reps.trim() !== '' && !repsValid && (
              <span id={repsErrId} role="alert" className="text-xs text-destructive">
                {t('workout.invalidReps')}
              </span>
            )}
          />
        )}
      </div>

      {/* Το κύριο κουμπί: πλήρες πλάτος, 48px, κάτω από τα πεδία — εκεί που
          φτάνει ο αντίχειρας και δεν «στριμώχνει» τα πεδία σε μία γραμμή. */}
      <div className="flex gap-2">
        <Button
          ref={saveRef}
          disabled={!valid || !restPauseValid || busy}
          onClick={() => void submit()}
          className="h-12 min-w-0 flex-1 text-base"
        >
          {t(saveLabelKey)}
        </Button>
        {onCancel && (
          <Button variant="ghost" onClick={onCancel} className="h-12 shrink-0">
            {t('common.cancel')}
          </Button>
        )}
      </div>

      {setType === 'rest_pause' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs uppercase tracking-wide text-muted-foreground">
            {t('workout.restPauseMiniSets')}
          </span>
          <Input
            value={restPauseReps}
            onChange={(e) => setRestPauseReps(e.target.value)}
            placeholder={t('workout.restPauseMiniSetsPlaceholder')}
            aria-label={t('workout.restPauseMiniSets')}
            className="h-11 min-w-0 font-mono tabular-nums"
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); void submit(true); }
            }}
          />
          <span className="text-xs text-muted-foreground">
            {t('workout.restPauseMiniSetsHint')}
          </span>
        </label>
      )}

      <button
        type="button"
        aria-expanded={showIntensity}
        onClick={() => setShowIntensity((v) => !v)}
        className="min-h-11 text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        {showIntensity ? t('workout.intensityHide') : t('workout.intensityShow')}
      </button>

      {showIntensity && (
        <div className="space-y-2">
          <div className="flex items-end gap-2">
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
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
                className="h-11 min-w-0 font-mono tabular-nums"
                aria-label={t('workout.rpe')}
                aria-invalid={rpe.trim() !== '' && (rpeNum == null || rpeNum < 1 || rpeNum > 10)}
                aria-describedby={rpe.trim() !== '' && (rpeNum == null || rpeNum < 1 || rpeNum > 10) ? rpeErrId : undefined}
              />
              {rpe.trim() !== '' && (rpeNum == null || rpeNum < 1 || rpeNum > 10) && (
                <span id={rpeErrId} role="alert" className="text-xs text-destructive">
                  {t('workout.invalidRpe')}
                </span>
              )}
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('workout.rir')}
              </span>
              <Input
                inputMode="numeric"
                type="number"
                step="1"
                min="0"
                value={rir}
                onChange={(e) => setRir(e.target.value)}
                className="h-11 min-w-0 font-mono tabular-nums"
                aria-label={t('workout.rir')}
                aria-invalid={rir.trim() !== '' && (rirNum == null || !Number.isSafeInteger(rirNum) || rirNum < 0)}
                aria-describedby={rir.trim() !== '' && (rirNum == null || !Number.isSafeInteger(rirNum) || rirNum < 0) ? rirErrId : undefined}
              />
              {rir.trim() !== '' && (rirNum == null || !Number.isSafeInteger(rirNum) || rirNum < 0) && (
                <span id={rirErrId} role="alert" className="text-xs text-destructive">
                  {t('workout.invalidRir')}
                </span>
              )}
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('workout.tempo')}
              </span>
              <Input
                value={tempo}
                onChange={(e) => setTempo(e.target.value)}
                placeholder="3-1-1-0"
                className="h-11 min-w-0 font-mono"
                aria-label={t('workout.tempo')}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('workout.setNote')}
            </span>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('workout.setNotePlaceholder')}
              className="h-10 text-sm"
              aria-label={t('workout.setNote')}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void submit(true); }
              }}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
