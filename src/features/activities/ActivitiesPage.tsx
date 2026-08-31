import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ChevronDown, ChevronUp, Pencil, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { reorderActivities, updateActivity } from '@/lib/db/queries';
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
  const active = useActivities(false);
  const all = useActivities(true);
  const archived = all.filter((a) => a.is_archived);

  const [showArchived, setShowArchived] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Activity | null>(null);

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

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('activities.title')}</h1>
      </header>

      {active.length === 0 ? (
        <p className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
          {t('activities.empty')}
        </p>
      ) : (
        <ul className="stagger space-y-2">
          {active.map((a, index) => (
            <li
              key={a.id}
              className="flex items-center gap-2 rounded-lg bg-card px-3 py-2"
            >
              {/* Το χρώμα ΕΙΝΑΙ η ταυτότητα της δραστηριότητας — ίδιο σημάδι με
                  το ημερολόγιο και τα chips. Το παλιό σύμβολο (⬛ ◆ ▲) έμενε
                  μόνο εδώ και έσπαγε τη συνέπεια. */}
              <ActivityIcon activity={a} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.label}</span>
              <div className="flex shrink-0 items-center gap-0.5">
                <button
                  type="button"
                  onClick={() => void move(index, -1)}
                  disabled={index === 0}
                  aria-label={t('activities.moveUp')}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void move(index, 1)}
                  disabled={index === active.length - 1}
                  aria-label={t('activities.moveDown')}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => openEdit(a)}
                  aria-label={t('activities.edit')}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => void setArchived(a.id, true)}
                  aria-label={t('activities.archive')}
                  className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Archive className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" className="w-full" onClick={openCreate}>
        <Plus className="h-4 w-4" />
        {t('activities.new')}
      </Button>

      {archived.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            {showArchived ? t('activities.hideArchived') : t('activities.showArchived')} (
            {archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 space-y-2">
              {archived.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-2 rounded-lg bg-card/50 px-3 py-2 opacity-60"
                >
                  <ActivityIcon activity={a} className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.label}</span>
                  <button
                    type="button"
                    onClick={() => void setArchived(a.id, false)}
                    aria-label={t('activities.unarchive')}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
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
    </div>
  );
}
