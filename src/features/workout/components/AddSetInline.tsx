import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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

  const bumpWeight = (delta: number) => {
    const cur = weightNum ?? 0;
    const next = Math.max(0, Math.round((cur + delta) * 100) / 100);
    setWeight(String(next));
  };

  const weightSteps = unit === 'lb' ? [-5, 5, 10] : [-2.5, 2.5, 5];

  const submit = async () => {
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
      // Το βάρος μένει ίδιο σετ-σετ — καθαρίζουν μόνο reps/hold/RPE/RIR/notes.
      setReps('');
      setHold('');
      setRpe('');
      setRir('');
      setNotes('');
    } catch {
      // Keep every entered value intact: a failed write must be visibly retryable.
      setSaveError(true);
    } finally {
      submitting.current = false;
      setBusy(false);
      requestAnimationFrame(() => primaryInputRef.current?.focus());
    }
  };

  return (
    <fieldset disabled={busy} aria-busy={busy} className="min-w-0 space-y-2">
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
        <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label={t('workout.setType')}>
          {/* Το τρέχον custom type (αν δεν είναι builtin) εμφανίζεται πρώτο ως ενεργό chip */}
          {!(BUILTIN_SET_TYPES as readonly string[]).includes(setType ?? 'normal') && setType && (
            <button
              type="button"
              role="radio"
              aria-checked
              className="rounded-full border border-border bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground"
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
                'min-h-11 rounded-full border border-border px-2.5 py-1 text-xs font-medium transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
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
              className="h-7 w-28 text-xs"
            />
          ) : (
            <button
              type="button"
              onClick={() => setCustomOpen(true)}
              aria-label={t('setType.custom')}
              className="min-h-11 min-w-11 rounded-full border border-dashed border-border px-2.5 py-1 text-xs font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              +
            </button>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        {weighted && (
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('common.weight')} ({t(`common.${unit}`)})
            </span>
            <Input
              inputMode="decimal"
              type="number"
              step="0.5"
              min="0"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              className="h-11 min-w-0 font-mono tabular-nums"
              aria-label={`${t('common.weight')} (${t(`common.${unit}`)})`}
              aria-invalid={weight.trim() !== '' && !weightValid}
              aria-describedby={weight.trim() !== '' && !weightValid ? weightErrId : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); primaryInputRef.current?.focus(); }
              }}
            />
            {weight.trim() !== '' && !weightValid && (
              <span id={weightErrId} role="alert" className="text-xs text-destructive">
                {t('workout.invalidWeight')}
              </span>
            )}
          </label>
        )}
        {holdActive ? (
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
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
              className="h-11 min-w-0 font-mono tabular-nums"
              aria-label={t('workout.holdSeconds')}
              aria-invalid={hold.trim() !== '' && !holdValid}
              aria-describedby={hold.trim() !== '' && !holdValid ? holdErrId : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void submit(); }
              }}
            />
            {hold.trim() !== '' && !holdValid && (
              <span id={holdErrId} role="alert" className="text-xs text-destructive">
                {t('workout.invalidHold')}
              </span>
            )}
          </label>
        ) : (
          <label className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('workout.reps')}
            </span>
            <Input
              ref={primaryInputRef}
              inputMode="decimal"
              type="number"
              min="0.5"
              step="any"
              value={reps}
              placeholder={allowsBlankReps ? t('workout.amrapPlaceholder') : undefined}
              onChange={(e) => setReps(e.target.value)}
              className="h-11 min-w-0 font-mono tabular-nums"
              aria-label={t('workout.reps')}
              aria-invalid={reps.trim() !== '' && !repsValid}
              aria-describedby={reps.trim() !== '' && !repsValid ? repsErrId : undefined}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void submit(); }
              }}
            />
            {reps.trim() !== '' && !repsValid && (
              <span id={repsErrId} role="alert" className="text-xs text-destructive">
                {t('workout.invalidReps')}
              </span>
            )}
          </label>
        )}
        <Button
          size="sm"
          disabled={!valid || !restPauseValid || busy}
          onClick={() => void submit()}
          className="h-11 shrink-0"
        >
          {t(saveLabelKey)}
        </Button>
        {onCancel && (
          <Button size="sm" variant="ghost" onClick={onCancel} className="h-11 shrink-0">
            {t('common.cancel')}
          </Button>
        )}
      </div>

      {/* Γρήγορα steppers βάρους — 1 tap για +2.5/-2.5/+5 χωρίς πληκτρολόγιο */}
      {weighted && (
        <div className="flex flex-wrap items-center gap-1.5">
          {weightSteps.map((delta) => (
            <button
              key={delta}
              type="button"
              onClick={() => bumpWeight(delta)}
              className="rounded-md border border-border/70 bg-background/60 px-2.5 py-1 font-mono text-xs tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-95"
            >
              {delta > 0 ? `+${delta}` : delta} {unit}
            </button>
          ))}
        </div>
      )}

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
              if (e.key === 'Enter') { e.preventDefault(); void submit(); }
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
                if (e.key === 'Enter') { e.preventDefault(); void submit(); }
              }}
            />
          </label>
        </div>
      )}
    </fieldset>
  );
}
