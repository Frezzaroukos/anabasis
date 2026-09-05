import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { BottomSheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createExercise, updateExercise, listExercises } from '@/lib/db/queries';
import { mergeExercises } from '@/lib/db/exerciseMerge';
import type { DefaultUnit, Exercise, MovementType } from '@/lib/db/types';
import { CategoryCombobox } from './CategoryCombobox';
import { TagInput } from './TagInput';
import { cn } from '@/lib/utils';

interface ExerciseFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** undefined = δημιουργία· δοσμένη άσκηση = επεξεργασία (και builtin επιτρέπεται). */
  exercise?: Exercise;
  categorySuggestions: string[];
}

const MOVEMENT_TYPES: MovementType[] = ['compound', 'isolation', 'skill'];
const DEFAULT_UNITS: DefaultUnit[] = ['kg', 'lb', 'sec', 'reps'];

interface FormState {
  name: string;
  category: string;
  movement_type: MovementType;
  equipment: string[];
  is_weighted: boolean;
  is_bodyweight: boolean;
  default_unit: DefaultUnit;
  notes: string;
}

function stateFromExercise(exercise: Exercise | undefined): FormState {
  return {
    name: exercise?.name ?? '',
    category: exercise?.category ?? '',
    movement_type: exercise?.movement_type ?? 'compound',
    equipment: exercise?.equipment ?? [],
    is_weighted: exercise?.is_weighted ?? true,
    is_bodyweight: exercise?.is_bodyweight ?? false,
    default_unit: exercise?.default_unit ?? 'kg',
    notes: exercise?.notes ?? '',
  };
}

/**
 * Δημιουργία/επεξεργασία άσκησης. Δουλεύει και πάνω σε builtin ασκήσεις —
 * το bootstrap πλέον δεν τις ξαναγράφει, οπότε η επεξεργασία μένει.
 */
export function ExerciseFormSheet({
  open,
  onClose,
  exercise,
  categorySuggestions,
}: ExerciseFormSheetProps) {
  const { t } = useTranslation();
  const [form, setForm] = useState<FormState>(() => stateFromExercise(exercise));
  const [busy, setBusy] = useState(false);
  const [mergeQuery, setMergeQuery] = useState('');
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null);
  const allExercises = useLiveQuery(() => listExercises(), [], []);

  // reset το φόρμα κάθε φορά που ανοίγει με νέα/άλλη άσκηση
  useEffect(() => {
    if (open) {
      setForm(stateFromExercise(exercise));
      setMergeQuery('');
      setMergeTargetId(null);
    }
  }, [open, exercise]);

  const mergeTarget = allExercises.find((e) => e.id === mergeTargetId) ?? null;
  const mergeMatches = allExercises
    .filter(
      (e) =>
        e.id !== exercise?.id &&
        !e.is_archived &&
        e.name.toLowerCase().includes(mergeQuery.trim().toLowerCase()),
    )
    .slice(0, 6);

  const onMerge = async () => {
    if (!exercise || !mergeTargetId || busy) return;
    setBusy(true);
    try {
      await mergeExercises(exercise.id, mergeTargetId);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const patch = (p: Partial<FormState>) => setForm((f) => ({ ...f, ...p }));

  const onSave = async () => {
    const name = form.name.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const input = {
        name,
        category: form.category.trim() || 'other',
        movement_type: form.movement_type,
        equipment: form.equipment,
        is_weighted: form.is_weighted,
        is_bodyweight: form.is_bodyweight,
        default_unit: form.default_unit,
        notes: form.notes.trim() || null,
      };
      if (exercise) {
        await updateExercise(exercise.id, input);
      } else {
        await createExercise(input);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={exercise ? t('exercises.editTitle') : t('exercises.newTitle')}
    >
      <div className="space-y-4 px-4 pb-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium">
            {t('exercises.form.name')}
          </label>
          <Input
            autoFocus
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={t('exercises.form.namePlaceholder')}
            aria-label={t('exercises.form.name')}
          />
        </div>

        <CategoryCombobox
          label={t('exercises.form.category')}
          value={form.category}
          onChange={(category) => patch({ category })}
          suggestions={categorySuggestions}
          placeholder={t('exercises.form.categoryPlaceholder')}
        />

        <div>
          <p className="mb-1.5 text-sm font-medium">{t('exercises.form.movementType')}</p>
          <div className="flex flex-wrap gap-2">
            {MOVEMENT_TYPES.map((mt) => (
              <button
                key={mt}
                type="button"
                onClick={() => patch({ movement_type: mt })}
                className={cn(
                  'rounded-md border border-border px-3 py-1.5 text-sm ring-offset-background transition-all duration-150 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  form.movement_type === mt
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'hover:bg-accent',
                )}
              >
                {t(`exercises.movementType.${mt}`)}
              </button>
            ))}
          </div>
        </div>

        <TagInput
          label={t('exercises.form.equipment')}
          value={form.equipment}
          onChange={(equipment) => patch({ equipment })}
          placeholder={t('exercises.form.equipmentPlaceholder')}
        />

        <div className="space-y-2 rounded-lg border border-border p-3">
          {(
            [
              ['is_weighted', 'exercises.form.isWeighted'],
              ['is_bodyweight', 'exercises.form.isBodyweight'],
            ] as const
          ).map(([key, labelKey]) => (
            <div key={key} className="flex items-center justify-between gap-3">
              <p className="text-sm">{t(labelKey)}</p>
              <button
                type="button"
                role="switch"
                aria-checked={form[key]}
                aria-label={t(labelKey)}
                onClick={() => patch({ [key]: !form[key] } as Partial<FormState>)}
                className={cn(
                  'h-6 w-11 shrink-0 rounded-full border border-border ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
                  form[key] ? 'bg-primary' : 'bg-muted',
                )}
              >
                <span
                  className={cn(
                    'block h-4 w-4 rounded-full bg-background transition-transform duration-150',
                    form[key] ? 'translate-x-6' : 'translate-x-1',
                  )}
                />
              </button>
            </div>
          ))}
        </div>

        {/* Ελεύθερη μονάδα (μέτρα, θερμίδες, όροφοι…) — τα builtin είναι
            απλώς προτάσεις, όχι όρια. Ίδιο combobox με την κατηγορία. */}
        <CategoryCombobox
          label={t('exercises.form.defaultUnit')}
          value={form.default_unit}
          onChange={(v) => patch({ default_unit: v })}
          suggestions={[...DEFAULT_UNITS]}
          placeholder={t('exercises.form.unitPlaceholder')}
        />

        <div>
          <label className="mb-1.5 block text-sm font-medium">
            {t('exercises.form.notes')}
          </label>
          <textarea
            value={form.notes}
            onChange={(e) => patch({ notes: e.target.value })}
            placeholder={t('exercises.form.notesPlaceholder')}
            aria-label={t('exercises.form.notes')}
            rows={3}
            className={cn(
              'flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm',
              'ring-offset-background placeholder:text-muted-foreground',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            )}
          />
        </div>

        {exercise && (
          <details className="rounded-lg border border-border/70">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium text-muted-foreground">
              {t('exercises.merge.title')}
            </summary>
            <div className="space-y-2 px-3 pb-3">
              <p className="text-[11px] leading-snug text-muted-foreground">
                {t('exercises.merge.hint')}
              </p>
              {mergeTarget ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium">
                      {mergeTarget.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => setMergeTargetId(null)}
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      {t('common.cancel')}
                    </button>
                  </div>
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={busy}
                    onClick={() => void onMerge()}
                  >
                    {t('exercises.merge.confirm', { name: mergeTarget.name })}
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <Input
                    value={mergeQuery}
                    onChange={(e) => setMergeQuery(e.target.value)}
                    placeholder={t('exercises.merge.search')}
                  />
                  {mergeQuery.trim() !== '' && (
                    <ul className="max-h-40 divide-y divide-border/60 overflow-y-auto rounded-md bg-elevated">
                      {mergeMatches.map((e) => (
                        <li key={e.id}>
                          <button
                            type="button"
                            onClick={() => setMergeTargetId(e.id)}
                            className="w-full px-3 py-2 text-left text-sm transition-colors hover:bg-accent"
                          >
                            {e.name}
                          </button>
                        </li>
                      ))}
                      {mergeMatches.length === 0 && (
                        <li className="px-3 py-2 text-sm text-muted-foreground">
                          {t('workout.noResults')}
                        </li>
                      )}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </details>
        )}

        <div className="flex gap-2 pt-1">
          <Button
            className="flex-1"
            disabled={!form.name.trim() || busy}
            onClick={() => void onSave()}
          >
            {t('common.save')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
