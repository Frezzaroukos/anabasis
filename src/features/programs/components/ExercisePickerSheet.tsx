import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Search } from 'lucide-react';
import { BottomSheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useExercises } from '@/hooks/useExercises';
import type { Exercise, ExerciseCategory } from '@/lib/db/types';
import { CATEGORY_DOT } from '../utils';
import { cn } from '@/lib/utils';

interface ExercisePickerSheetProps {
  open: boolean;
  onClose: () => void;
  onPick: (exercise: Exercise) => void;
  /** 'multi' = διάλεξε πολλές μαζί χωρίς κλείσιμο ανά tap· default 'single' */
  mode?: 'single' | 'multi';
  /** μόνο για 'multi': προσθήκη όλων των επιλεγμένων σε ένα call */
  onPickMany?: (exercises: Exercise[]) => void;
}

const CATEGORY_ORDER: ExerciseCategory[] = ['push', 'pull', 'legs', 'core', 'other'];

/**
 * Ίδιο σκελετός με AddExerciseSheet του workout feature, αλλά αυτοτελές εδώ
 * (δεν αγγίζουμε άλλα features) — και ΧΩΡΙΣ excludeIds, γιατί ένα πρόγραμμα
 * μπορεί να έχει την ίδια άσκηση πολλές φορές (π.χ. dropset chain).
 */
export function ExercisePickerSheet({
  open,
  onClose,
  onPick,
  mode = 'single',
  onPickMany,
}: ExercisePickerSheetProps) {
  const { t } = useTranslation();
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Exercise[]>([]);
  const all = useExercises();

  const isSelected = (id: string) => selected.some((e) => e.id === id);

  const toggle = (ex: Exercise) => {
    setSelected((prev) =>
      prev.some((e) => e.id === ex.id) ? prev.filter((e) => e.id !== ex.id) : [...prev, ex],
    );
  };

  const confirmMulti = () => {
    if (selected.length > 0) onPickMany?.(selected);
    setSelected([]);
    setQ('');
    onClose();
  };

  const grouped = useMemo(() => {
    const filtered = all.filter((e) =>
      q.trim() === '' ? true : e.name.toLowerCase().includes(q.trim().toLowerCase()),
    );
    const buckets = new Map<ExerciseCategory, Exercise[]>();
    for (const ex of filtered) {
      const arr = buckets.get(ex.category) ?? [];
      arr.push(ex);
      buckets.set(ex.category, arr);
    }
    return CATEGORY_ORDER.map((cat) => ({ cat, items: buckets.get(cat) ?? [] }));
  }, [all, q]);

  const totalShown = grouped.reduce((acc, g) => acc + g.items.length, 0);

  return (
    <BottomSheet open={open} onClose={onClose} title={t('workout.addExercise')}>
      <div className="px-4 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('workout.searchExercises')}
            className="pl-9"
          />
        </div>
      </div>

      {totalShown === 0 ? (
        <p className="p-6 text-center text-sm text-muted-foreground">
          {t('workout.noResults')}
        </p>
      ) : (
        <div className="px-2 pb-4">
          {grouped.map(({ cat, items }) =>
            items.length === 0 ? null : (
              <section key={cat} className="mb-2">
                <h3 className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {t(`workout.category.${cat}`)}
                </h3>
                <ul>
                  {items.map((ex) => (
                    <li key={ex.id}>
                      <button
                        type="button"
                        onClick={() => {
                          if (mode === 'multi') {
                            toggle(ex);
                          } else {
                            onPick(ex);
                            onClose();
                            setQ('');
                          }
                        }}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-accent',
                          mode === 'multi' && isSelected(ex.id) && 'bg-accent',
                        )}
                      >
                        <span
                          className={cn('h-2 w-2 shrink-0 rounded-full', CATEGORY_DOT[ex.category])}
                          aria-hidden
                        />
                        <span className="flex-1 truncate">{ex.name}</span>
                        {ex.is_bodyweight && (
                          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            BW
                          </span>
                        )}
                        {mode === 'multi' && isSelected(ex.id) && (
                          <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ),
          )}
        </div>
      )}

      {mode === 'multi' && (
        <div className="sticky bottom-0 border-t border-border bg-background/95 p-3 backdrop-blur safe-bottom">
          <Button
            className="w-full"
            disabled={selected.length === 0}
            onClick={confirmMulti}
          >
            {t('programs.addN', { count: selected.length })}
          </Button>
        </div>
      )}
    </BottomSheet>
  );
}
