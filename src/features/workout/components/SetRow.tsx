import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { queries } from '@/lib/db';
import type { SetEntry, SetType } from '@/lib/db/types';
import { useAppSettings } from '@/hooks/useAppSettings';
import { AddSetInline } from './AddSetInline';
import { formatLoad, groupColorClass, isChainSetType } from '../utils';

interface SetRowProps {
  set: SetEntry;
  weighted: boolean;
  /** Άσκηση skill/isometric — δείχνει hold (δευτ) αντί για reps στο edit. */
  holdMode?: boolean;
}

const ACTION_WIDTH = 128;
const SWIPE_THRESHOLD = 60;
/** Διάρκεια της accent pulse γύρω από τη γραμμή που μόλις καταγράφηκε. */
const COMMIT_GLOW_MS = 300;

export function SetRow({ set, weighted, holdMode = false }: SetRowProps) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; current: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Η γραμμή μόνο μόλις καταγράφηκε παίρνει τη λάμψη — mount = trigger, ίδιο
  // pattern με το animate-set-commit που ήδη υπάρχει (νέο σετ = νέο key/mount,
  // επεξεργασία δεν remount-άρει). Το CSS keyframe παρακάτω σέβεται το
  // prefers-reduced-motion μόνο του, οπότε δεν χρειάζεται έλεγχος εδώ.
  const [justCommitted, setJustCommitted] = useState(true);
  useEffect(() => {
    const id = globalThis.setTimeout(() => setJustCommitted(false), COMMIT_GLOW_MS);
    return () => globalThis.clearTimeout(id);
  }, []);

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
  };

  const onSaveEdit = async (
    weightKg: number | null,
    reps: number | null,
    holdSeconds: number | null,
  ) => {
    await queries.updateSet(set.id, { weight_kg: weightKg, reps, hold_seconds: holdSeconds });
    setEditing(false);
  };

  // Αλλαγή set_type σε ήδη καταγεγραμμένο σετ (π.χ. διόρθωση σε dropset εκ
  // των υστέρων) — commit άμεσα, δεν περιμένει το «Αποθήκευση» της φόρμας.
  const onChangeSetType = async (nextType: SetType) => {
    await queries.updateSet(set.id, {
      set_type: nextType,
      group_id: isChainSetType(nextType) ? (set.group_id ?? crypto.randomUUID()) : null,
    });
  };

  if (editing) {
    return (
      <div className="rounded-md bg-elevated p-2">
        <AddSetInline
          weighted={weighted}
          holdMode={holdMode}
          unit={unit}
          initialWeight={set.weight_kg}
          initialReps={set.reps}
          initialHoldSeconds={set.hold_seconds}
          onSave={onSaveEdit}
          onCancel={() => setEditing(false)}
          saveLabelKey="workout.save"
          setType={set.set_type}
          onSetTypeChange={(t) => void onChangeSetType(t)}
        />
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative overflow-hidden rounded-md">
      {/* Action layer (under the row) */}
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
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {/* Row */}
      <div
        className={cn(
          'relative flex select-none items-center justify-between bg-card px-3 py-2 transition-transform touch-pan-y',
          'animate-set-commit',
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
        <div className="flex items-center gap-3 text-sm">
          <span className="w-6 font-mono text-xs tabular-nums text-muted-foreground">#{set.set_number}</span>
          <span className="font-mono font-semibold tabular-nums">
            {formatLoad(set.weight_kg, set.bodyweight_kg, unit)}
            {set.reps != null ? <> × {set.reps}</> : null}
            {set.hold_seconds != null ? <> · {set.hold_seconds}s</> : null}
          </span>
          {/* Η ένταση φαίνεται μόνο όταν καταγράφηκε — αλλιώς θα ήταν
              write-only πεδίο, δηλαδή άχρηστο. */}
          {set.rpe != null && (
            <span className="font-mono text-[10px] text-muted-foreground">
              RPE {set.rpe}
            </span>
          )}
          {set.rir != null && (
            <span className="font-mono text-[10px] text-muted-foreground">
              RIR {set.rir}
            </span>
          )}
          {set.tempo && (
            <span className="font-mono text-[10px] text-muted-foreground">
              {set.tempo}
            </span>
          )}
        </div>
        {set.set_type !== 'normal' && (
          <span className="flex items-center gap-1 rounded-full bg-elevated px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {set.group_id && <Link2 className="h-3 w-3" aria-hidden />}
            {t(`setType.${set.set_type}`)}
          </span>
        )}
      </div>
    </div>
  );
}
