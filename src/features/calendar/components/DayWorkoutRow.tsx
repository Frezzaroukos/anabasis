import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ChevronRight, Pencil, Trash2 } from 'lucide-react';
import { db } from '@/lib/db';
import { restoreWorkout, setWorkoutType, softDeleteWorkout, updateWorkoutMeta } from '@/lib/db/queries';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/toast-context';
import { cn } from '@/lib/utils';

/**
 * Μία ολοκληρωμένη προπόνηση στη μέρα: άνοιγμα λεπτομέρειας, μετονομασία
 * και διαγραφή με αναίρεση. Η διαγραφή είναι soft και ξαναϋπολογίζει τα PR
 * (`softDeleteWorkout` / `restoreWorkout`).
 */
export function DayWorkoutRow({
  id,
  title,
  meta,
  dotClass,
}: {
  id: string;
  title: string;
  meta: string;
  dotClass: string;
}) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [editOpen, setEditOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const workout = useLiveQuery(() => (editOpen ? db.workouts.get(id) : undefined), [editOpen, id]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!editOpen || !workout) return;
    setName(workout.workout_type ?? '');
    setNotes(workout.notes ?? '');
  }, [editOpen, workout]);

  const save = async () => {
    await setWorkoutType(id, name.trim() || null);
    await updateWorkoutMeta(id, { notes: notes.trim() || null });
    setEditOpen(false);
  };

  const remove = async () => {
    setConfirmDelete(false);
    await softDeleteWorkout(id);
    showToast({
      message: t('calendar.workoutDeleted'),
      actionLabel: t('common.undo'),
      onAction: () => {
        void restoreWorkout(id);
      },
      durationMs: 7000,
    });
  };

  return (
    <li className="flex items-center gap-1">
      <Link
        to={`/history/${id}`}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md bg-muted/40 px-3 py-2 ring-offset-background transition-all duration-150 hover:bg-muted active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      >
        <span className={cn('h-2 w-2 shrink-0 rounded-full', dotClass)} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{title}</span>
          <span className="block truncate font-mono text-xs text-muted-foreground">{meta}</span>
        </span>
        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
      <button
        type="button"
        aria-label={t('calendar.editWorkout', { name: title })}
        onClick={() => setEditOpen(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
      >
        <Pencil className="h-4 w-4" aria-hidden />
      </button>
      <button
        type="button"
        aria-label={t('calendar.deleteWorkout', { name: title })}
        onClick={() => setConfirmDelete(true)}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/15 hover:text-destructive"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
      </button>

      <BottomSheet open={editOpen} onClose={() => setEditOpen(false)} title={t('calendar.editWorkout', { name: title })}>
        <div className="space-y-4 px-4 pb-4">
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              {t('calendar.workoutName')}
            </span>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="h-11" />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              {t('calendar.workoutNotes')}
            </span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} className="h-11" />
          </label>
          <Button className="h-11" onClick={() => void save()}>
            {t('common.save')}
          </Button>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmDelete}
        title={t('calendar.deleteWorkoutTitle')}
        description={t('calendar.deleteWorkoutDesc')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}
