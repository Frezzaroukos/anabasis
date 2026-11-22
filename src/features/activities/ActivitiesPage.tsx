import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Activity as ActivityGlyph, Archive, ChevronDown, ChevronUp, Pencil, Play, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/EmptyState';
import { reorderActivities, startAdHocWorkout, updateActivity } from '@/lib/db/queries';
import { deleteActivity } from '@/lib/db/activities';
import { useToast } from '@/components/ui/toast-context';
import type { Activity } from '@/lib/db/types';
import { ActivityIcon } from '@/components/activityIcon';
import { useActivities } from './useActivities';
import { ActivityFormSheet } from './components/ActivityFormSheet';

/**
 * Διαχείριση δραστηριοτήτων/αθλημάτων. Τα 8 builtin ζουν εδώ σαν κανονικές
 * εγγραφές — μετονομάζονται/κρύβονται σαν όλα τα άλλα. Καμία σταθερή λίστα.
 */
export function ActivitiesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const active = useActivities(false);
  const all = useActivities(true);
  const archived = all.filter((a) => a.is_archived);

  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Activity | null>(null);

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (a: Activity) => {
    setEditing(a);
    setFormOpen(true);
  };

  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= active.length) return;
    const next = [...active];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    await reorderActivities(next.map((x) => x.id));
  };

  const setArchived = async (id: string, archivedNext: boolean) => {
    await updateActivity(id, { is_archived: archivedNext });
  };

  const onDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const result = await deleteActivity(target.id);
    setDeleteTarget(null);
    if (result !== 'deleted') return;
    showToast({
      message: t('activities.deletedToast'),
      actionLabel: t('common.undo'),
      onAction: () => void updateActivity(target.id, { deleted_at: null }),
      durationMs: 7000,
    });
  };

  /**
   * Άμεση έναρξη δραστηριότητας χωρίς πρόγραμμα (τρέξιμο, ποδήλατο, μπάσκετ…).
   * Πριν, το ad-hoc start ήταν πάντα strength — για ένα τρέξιμο έπρεπε να
   * στηθεί πρόγραμμα ή να μπερδευτείς με το ημερολόγιο.
   */
  const onStart = async (a: Activity) => {
    const result = await startAdHocWorkout(a.key, undefined, a.label);
    if (!result) {
      showToast({ message: t('activities.startBlocked') });
      return;
    }
    navigate('/workout/active');
  };

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('activities.title')}</h1>
        <Button size="icon" variant="outline" aria-label={t('activities.new')} onClick={openCreate}>
          <Plus className="h-4 w-4" />
        </Button>
      </header>

      {active.length === 0 ? (
        <EmptyState icon={ActivityGlyph} title={t('activities.empty')} />
      ) : (
        /* Μία λίστα με hairlines αντί για 8 ξεχωριστές κάρτες — ίδια γλώσσα με
           Skills/Settings· τα controls ανά γραμμή στα 44px. Στο 320px τα 5–6
           κουμπιά δεν χωρούν δίπλα στο όνομα: η γραμμή κάνει wrap και τα
           actions πάνε δεξιά στη δεύτερη σειρά, ώστε το όνομα να μένει
           αναγνώσιμο (πριν συμπιεζόταν σε «R…» / 0px). */
        <ul className="stagger divide-y divide-border/50 overflow-hidden rounded-xl bg-card">
          {active.map((a, index) => (
            <li
              key={a.id}
              className="flex min-h-[3.25rem] flex-wrap items-center gap-3 gap-y-1 py-1 pl-4 pr-1"
            >
              {/* Το χρώμα ΕΙΝΑΙ η ταυτότητα της δραστηριότητας — ίδιο σημάδι με
                  το ημερολόγιο και τα chips. Το παλιό σύμβολο (⬛ ◆ ▲) έμενε
                  μόνο εδώ και έσπαγε τη συνέπεια. */}
              <ActivityIcon activity={a} className="h-4 w-4 shrink-0" />
              <span className="min-w-[5rem] flex-1 truncate text-sm font-medium">{a.label}</span>
              <div className="ml-auto flex shrink-0 items-center">
                <button
                  type="button"
                  onClick={() => void move(index, -1)}
                  disabled={index === 0}
                  aria-label={t('activities.moveUp')}
                  className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void move(index, 1)}
                  disabled={index === active.length - 1}
                  aria-label={t('activities.moveDown')}
                  className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  aria-label={t('activities.edit')}
                  className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                {!a.uses_sets && (
                  <button
                    type="button"
                    onClick={() => void onStart(a)}
                    aria-label={t('activities.start')}
                    title={t('activities.start')}
                    className="flex h-11 w-10 items-center justify-center rounded-md text-primary hover:bg-primary/10"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => void setArchived(a.id, true)}
                  aria-label={t('activities.archive')}
                  className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Archive className="h-4 w-4" />
                </button>
                {/* Τα builtin είναι κοινά σε όλα τα προφίλ — μόνο τα δικά σου
                    custom rows έχουν νόημα να διαγραφούν. */}
                {a.user_id != null && (
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(a)}
                    aria-label={t('activities.delete')}
                    className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {archived.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="flex h-11 items-center px-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showArchived ? t('activities.hideArchived') : t('activities.showArchived')} (
            {archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 divide-y divide-border/50 overflow-hidden rounded-xl bg-card/50 opacity-70">
              {archived.map((a) => (
                <li
                  key={a.id}
                  className="flex min-h-[3.25rem] items-center gap-3 py-1 pl-4 pr-1"
                >
                  <ActivityIcon activity={a} className="h-4 w-4 shrink-0" />
                  <span className="min-w-[5rem] flex-1 truncate text-sm font-medium">{a.label}</span>
                  <button
                    type="button"
                    onClick={() => void setArchived(a.id, false)}
                    aria-label={t('activities.unarchive')}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <ActivityFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        activity={editing}
      />

      <ConfirmDialog
        open={deleteTarget != null}
        title={t('activities.deleteConfirmTitle')}
        description={t('activities.deleteConfirmDesc')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void onDelete()}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}
