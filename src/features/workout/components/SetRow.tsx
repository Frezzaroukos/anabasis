import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link2, Pencil, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { queries } from '@/lib/db';
import type { SetEntry } from '@/lib/db/types';
import { AddSetInline } from './AddSetInline';
import { formatLoad, groupColorClass } from '../utils';

interface SetRowProps {
  set: SetEntry;
  weighted: boolean;
}

const ACTION_WIDTH = 128;
const SWIPE_THRESHOLD = 60;

export function SetRow({ set, weighted }: SetRowProps) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [drag, setDrag] = useState<{ startX: number; current: number } | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

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

  const onSaveEdit = async (weightKg: number | null, reps: number | null) => {
    await queries.updateSet(set.id, { weight_kg: weightKg, reps });
    setEditing(false);
  };

  if (editing) {
    return (
      <div className="rounded-md border border-border bg-background p-2">
        <AddSetInline
          weighted={weighted}
          initialWeight={set.weight_kg}
          initialReps={set.reps}
          onSave={onSaveEdit}
          onCancel={() => setEditing(false)}
          saveLabelKey="workout.save"
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
            'pointer-events-auto flex flex-1 items-center justify-center gap-1 bg-secondary text-xs font-medium',
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
            'pointer-events-auto flex flex-1 items-center justify-center gap-1 bg-destructive text-xs font-medium text-destructive-foreground',
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
          set.group_id && groupColorClass(set.group_id),
        )}
        style={{ transform: `translateX(${offset}px)`, transitionDuration: drag ? '0ms' : '180ms' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => setEditing(true)}
      >
        <div className="flex items-center gap-3 text-sm">
          <span className="w-6 text-xs text-muted-foreground">#{set.set_number}</span>
          <span className="font-medium">
            {formatLoad(set.weight_kg, set.bodyweight_kg)}
            {set.reps != null ? <> × {set.reps}</> : null}
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
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            {set.group_id && <Link2 className="h-3 w-3" aria-hidden />}
            {t(`setType.${set.set_type}`)}
          </span>
        )}
      </div>
    </div>
  );
}
