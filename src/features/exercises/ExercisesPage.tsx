import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Plus, Search } from 'lucide-react';
import {
  listAllExercises,
  listExerciseCategories,
  setExerciseArchived,
} from '@/lib/db/queries';
import type { Exercise } from '@/lib/db/types';
import { } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ExerciseFormSheet } from './components/ExerciseFormSheet';
import { categoryDotClass, groupExercisesByCategory } from './utils';
import { cn } from '@/lib/utils';

type LibraryFilter = 'all' | 'mine' | 'archived';

/**
 * Η βιβλιοθήκη ασκήσεων — το σημείο όπου το app σταματάει να είναι κλειστό.
 * Μέχρι πρόσφατα υπήρχαν μόνο 32 seeded ασκήσεις χωρίς κανέναν τρόπο να
 * προστεθεί δική σου. Εδώ ο χρήστης βλέπει, φτιάχνει και επεξεργάζεται.
 */
export function ExercisesPage() {
  const { t } = useTranslation();

  const allExercises = useLiveQuery(() => listAllExercises(), [], []);
  const categories = useLiveQuery(() => listExerciseCategories(), [], []);

  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | undefined>(undefined);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return allExercises.filter((ex) => {
      if (filter === 'archived' && !ex.is_archived) return false;
      if (filter !== 'archived' && ex.is_archived) return false;
      if (filter === 'mine' && ex.user_id !== getCurrentUserId()) return false;
      if (q !== '' && !ex.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allExercises, filter, query]);

  const groups = useMemo(
    () => groupExercisesByCategory(filtered, categories),
    [filtered, categories],
  );

  const openCreate = () => {
    setEditingExercise(undefined);
    setFormOpen(true);
  };

  const openEdit = (ex: Exercise) => {
    setEditingExercise(ex);
    setFormOpen(true);
  };

  const onToggleArchive = async (ex: Exercise) => {
    await setExerciseArchived(ex.id, !ex.is_archived);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('exercises.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {allExercises.filter((e) => !e.is_archived).length} {t('exercises.available')}
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          {t('exercises.new')}
        </Button>
      </header>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('exercises.search')}
          className="pl-9"
          aria-label={t('exercises.search')}
        />
      </div>

      <div className="flex gap-2">
        {(['all', 'mine', 'archived'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
              filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {t(`exercises.filter.${f}`)}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {filter === 'archived' ? t('exercises.emptyArchived') : t('exercises.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map(({ category, items }) => (
            <section key={category}>
              <h3 className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </h3>
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {items.map((ex) => (
                  <li key={ex.id} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={cn('h-2 w-2 shrink-0 rounded-full', categoryDotClass(ex.category))}
                      aria-hidden
                    />
                    <button
                      type="button"
                      onClick={() => openEdit(ex)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {ex.name}
                        {ex.user_id === null ? (
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
                            {t('exercises.builtin')}
                          </span>
                        ) : (
                          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
                            {t('exercises.custom')}
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {t(`exercises.movementType.${ex.movement_type}`)}
                        {ex.equipment.length > 0 && ` · ${ex.equipment.join(', ')}`}
                      </p>
                    </button>
                    <button
                      type="button"
                      onClick={() => void onToggleArchive(ex)}
                      aria-label={t(ex.is_archived ? 'exercises.unarchive' : 'exercises.archive')}
                      className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      {ex.is_archived ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ExerciseFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        exercise={editingExercise}
        categorySuggestions={categories}
      />
    </div>
  );
}
