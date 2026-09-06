import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Activity as ActivityGlyph, Archive, ChevronDown, ChevronUp, Pencil, Plus, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
      <header className="flex items-start justify-between gap-3">
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('activities.title')}</h1>
        <Button size="icon" variant="outline" aria-label={t('activities.new')} onClick={openCreate}>
          <Plus className="h-4 w-4" />
        </Button>
      </header>

      {active.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-10 text-center">
          <ActivityGlyph className="h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('activities.empty')}</p>
        </div>
      ) : (
        /* Μία λίστα με hairlines αντί για 8 ξεχωριστές κάρτες — ίδια γλώσσα με
           Skills/Settings· τα 4 controls ανά γραμμή στα 44px, χωρίς να φουσκώνει
           η γραμμή (py-1 + τα κουμπιά ορίζουν το ύψος). */
        <ul className="stagger divide-y divide-border/50 overflow-hidden rounded-xl bg-card">
          {active.map((a, index) => (
            <li
              key={a.id}
              className="flex min-h-[3.25rem] items-center gap-3 py-1 pl-4 pr-1"
            >
              {/* Το χρώμα ΕΙΝΑΙ η ταυτότητα της δραστηριότητας — ίδιο σημάδι με
                  το ημερολόγιο και τα chips. Το παλιό σύμβολο (⬛ ◆ ▲) έμενε
                  μόνο εδώ και έσπαγε τη συνέπεια. */}
              <ActivityIcon activity={a} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.label}</span>
              <div className="flex shrink-0 items-center">
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
                <button
                  type="button"
                  onClick={() => void setArchived(a.id, true)}
                  aria-label={t('activities.archive')}
                  className="flex h-11 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Archive className="h-4 w-4" />
                </button>
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
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{a.label}</span>
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
    </div>
  );
}
