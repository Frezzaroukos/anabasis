import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Copy, Link2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { queries } from '@/lib/db';
import { duplicateSet } from '@/lib/db/workoutHelpers';
import { restoreSet } from '@/lib/db/workoutRestore';
import { useToast } from '@/components/ui/toast-context';
import { BUILTIN_SET_TYPES, type SetEntry, type SetType } from '@/lib/db/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { AddSetInline, type SetIntensity } from './AddSetInline';
import { formatLoad, groupColorClass, isChainSetType } from '../utils';

interface SetRowProps {
  set: SetEntry;
  weighted: boolean;
  /** Άσκηση skill/isometric — δείχνει hold (δευτ) αντί για reps στο edit. */
  holdMode?: boolean;
  /** Ενεργοποιεί τη σύντομη λάμψη καταγραφής (true στο active workout, false στο history view). */
  animateCommit?: boolean;
  /** Προαιρετικό callback μετά από αντιγραφή σετ (π.χ. για ειδοποίηση PR). */
  onDuplicated?: (newPRCount: number) => void;
  /** Όταν δίνεται, εμφανίζεται ενέργεια «μετακίνηση σε άλλη άσκηση» (λάθος άσκηση). */
  onMoveToExercise?: () => void;
}

const ACTION_WIDTH = 128;
const SWIPE_THRESHOLD = 60;
/** Διάρκεια της accent pulse γύρω από τη γραμμή που μόλις καταγράφηκε. */
const COMMIT_GLOW_MS = 300;

export function SetRow({
  set,
  weighted,
  holdMode = false,
  animateCommit = true,
  onDuplicated,
  onMoveToExercise,
}: SetRowProps) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const { showToast } = useToast();
  const unit = settings?.weight_unit ?? 'kg';
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; current: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [justCommitted, setJustCommitted] = useState(animateCommit);

  useEffect(() => {
    if (!animateCommit) return;
    const id = globalThis.setTimeout(() => setJustCommitted(false), COMMIT_GLOW_MS);
    return () => globalThis.clearTimeout(id);
  }, [animateCommit]);

  // Tap outside collapses the swipe.
  useEffect(() => {
    if (!revealed) return;
    const onPointerDown = (e: PointerEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setRevealed(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [revealed]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (editing) return;
    // Μην παγιδεύεις τα taps πάνω στα κουμπιά ενεργειών (Edit/Repeat/Delete).
    if ((e.target as HTMLElement).closest('button')) return;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag({ startX: e.clientX, current: revealed ? -ACTION_WIDTH : 0 });
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const dx = e.clientX - drag.startX;
    const base = revealed ? -ACTION_WIDTH : 0;
    const next = Math.min(0, Math.max(-ACTION_WIDTH, base + dx));
    setDrag({ ...drag, current: next });
  };
  const onPointerUp = () => {
    if (!drag) return;
    const dragged = drag.current;
    setDrag(null);
    setRevealed(dragged < -SWIPE_THRESHOLD);
  };

  const offset = drag ? drag.current : revealed ? -ACTION_WIDTH : 0;

  const onDelete = async () => {
    setRevealed(false);
    await queries.softDeleteSet(set.id);
    showToast({
      message: t('workout.setDeletedToast'),
      actionLabel: t('history.undo'),
      onAction: () => void restoreSet(set.id),
      durationMs: 6000,
    });
  };

  const onDuplicate = async () => {
    if (duplicating) return;
    setDuplicating(true);
    try {
      const res = await duplicateSet(set);
      onDuplicated?.(res.newPRs.length);
    } finally {
      setDuplicating(false);
    }
  };

  const onSaveEdit = async (
    weightKg: number | null,
    reps: number | null,
    holdSeconds: number | null,
    intensity: SetIntensity,
    restPauseReps: number[],
  ) => {
    await queries.updateSet(set.id, {
      weight_kg: weightKg,
      reps,
      rest_pause_reps: restPauseReps,
      hold_seconds: holdSeconds,
      rpe: intensity.rpe,
      rir: intensity.rir,
      tempo: intensity.tempo,
      notes: intensity.notes ?? null,
    });
    setEditing(false);
  };

  // Αλλαγή set_type σε ήδη καταγεγραμμένο σετ (π.χ. διόρθωση σε dropset εκ
  // των υστέρων) — commit άμεσα, δεν περιμένει το «Αποθήκευση» της φόρμας.
  const onChangeSetType = async (nextType: SetType) => {
    await queries.updateSet(set.id, {
      set_type: nextType,
      ...(nextType === 'rest_pause' ? {} : { rest_pause_reps: [] }),
      group_id: isChainSetType(nextType) ? (set.group_id ?? crypto.randomUUID()) : null,
    });
  };

  const effectiveWeighted = set.weight_kg != null ? true : weighted;
  const setTypeDisplay = (BUILTIN_SET_TYPES as readonly string[]).includes(set.set_type)
    ? t(`setType.${set.set_type}`)
    : set.set_type;

  if (editing) {
    return (
      <div className="rounded-md bg-elevated p-2">
        <AddSetInline
          weighted={effectiveWeighted}
          holdMode={holdMode}
          unit={unit}
          initialWeight={set.weight_kg}
          initialReps={set.reps}
          initialHoldSeconds={set.hold_seconds}
          initialRestPauseReps={set.rest_pause_reps ?? []}
          initialRpe={set.rpe}
          initialRir={set.rir}
          initialTempo={set.tempo}
          initialNotes={set.notes}
          onSave={onSaveEdit}
          onCancel={() => setEditing(false)}
          saveLabelKey="workout.save"
          setType={set.set_type}
          onSetTypeChange={(nextType) => void onChangeSetType(nextType)}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-md">
      {/* Swipe action layer (mobile touch gesture preserved) */}
      <div className="pointer-events-none absolute inset-y-0 right-0 flex w-32">
        <button
          type="button"
          onClick={() => {
            setRevealed(false);
            setEditing(true);
          }}
          className={cn(
            'pointer-events-auto flex flex-1 items-center justify-center gap-1 bg-secondary text-xs font-medium transition-colors hover:bg-accent',
            revealed ? '' : 'opacity-0',
          )}
          aria-label={t('common.edit')}
          tabIndex={revealed ? 0 : -1}
          aria-hidden={!revealed}
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => void onDelete()}
          className={cn(
            'pointer-events-auto flex flex-1 items-center justify-center gap-1 bg-destructive text-xs font-medium text-destructive-foreground transition-colors hover:opacity-90',
            revealed ? '' : 'opacity-0',
          )}
          aria-label={t('common.delete')}
          tabIndex={revealed ? 0 : -1}
          aria-hidden={!revealed}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Row */}
      <div
        className={cn(
          'relative flex select-none items-center justify-between gap-2 bg-card px-3 py-2 transition-transform touch-pan-y',
          animateCommit && 'animate-set-commit',
          justCommitted && 'set-row-commit-glow',
          set.group_id && groupColorClass(set.group_id),
        )}
        style={{ transform: `translateX(${offset}px)`, transitionDuration: drag ? '0ms' : '180ms' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setEditing(true)}
      >
        {justCommitted && (
          <style>{`
            @keyframes set-row-commit-glow {
              0% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0); }
              30% { box-shadow: 0 0 14px 1px hsl(var(--primary) / 0.45); }
              100% { box-shadow: 0 0 0 0 hsl(var(--primary) / 0); }
            }
            .set-row-commit-glow { animation: set-row-commit-glow ${COMMIT_GLOW_MS}ms ease-out; }
            @media (prefers-reduced-motion: reduce) {
              .set-row-commit-glow { animation: none; }
            }
          `}</style>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm">
            <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
              #{set.set_number}
            </span>
            <span className="font-mono font-semibold tabular-nums">
              {formatLoad(set.weight_kg, set.bodyweight_kg, unit)}
              {set.reps != null ? <> × {set.reps}</> : null}
              {set.reps == null && set.hold_seconds == null && set.set_type === 'amrap' ? (
                <> × max</>
              ) : null}
              {(set.rest_pause_reps?.length ?? 0) > 0 ? (
                <> + {set.rest_pause_reps.join(' + ')}</>
              ) : null}
              {set.hold_seconds != null ? <> · {set.hold_seconds}s</> : null}
            </span>
            {set.rpe != null && (
              <span className="font-mono text-xs text-muted-foreground">RPE {set.rpe}</span>
            )}
            {set.rir != null && (
              <span className="font-mono text-xs text-muted-foreground">RIR {set.rir}</span>
            )}
            {set.tempo && (
              <span className="font-mono text-xs text-muted-foreground">{set.tempo}</span>
            )}
            {set.set_type !== 'normal' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-elevated px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {set.group_id && <Link2 className="h-3 w-3" aria-hidden />}
                {setTypeDisplay}
              </span>
            )}
          </div>
          {set.notes &&
            !(set.set_type === 'amrap' && set.reps == null && set.notes.trim().toLowerCase() === 'max') && (
              <p className="mt-0.5 truncate pl-8 text-xs text-muted-foreground">{set.notes}</p>
            )}
        </div>

        {/* Άμεσες, ορατές ενέργειες σετ — χωρίς κρυφά gestures σε desktop ή κινητό */}
        <div className="flex shrink-0 items-center gap-0.5">
          {onMoveToExercise && (
            <button
              type="button"
              onClick={() => {
                setRevealed(false);
                onMoveToExercise();
              }}
              aria-label={t('workout.moveSet')}
              title={t('workout.moveSet')}
              className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            disabled={duplicating}
            onClick={() => void onDuplicate()}
            aria-label={t('workout.duplicateSet')}
            title={t('workout.duplicateSet')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Copy className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => {
              setRevealed(false);
              setEditing(true);
            }}
            aria-label={t('common.edit')}
            title={t('common.edit')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:scale-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void onDelete()}
            aria-label={t('common.delete')}
            title={t('common.delete')}
            className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive active:scale-90 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
