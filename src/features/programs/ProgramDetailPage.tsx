import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import { ChevronDown, ChevronUp, Link2, Play, Plus } from 'lucide-react';
import {
  addProgramExercisesBulk,
  getProgramAdherence,
  getProgramWithExercises,
  setProgramTarget,
  listExercises,
  removeProgramExercise,
  reorderProgramExercises,
  startWorkoutFromProgram,
  updateProgramExercise,
} from '@/lib/db/queries';
import type { Exercise } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { ExercisePickerSheet } from './components/ExercisePickerSheet';
import { ProgramExerciseRow } from './components/ProgramExerciseRow';
import { flattenGroupOrder, groupProgramExercises, type ProgramGroup } from './utils';
import { cn } from '@/lib/utils';

/**
 * Ο editor ενός προγράμματος — «πρότυπο», όχι προπόνηση. Δουλεύει πάνω σε
 * στόχους (target_sets/reps/weight/hold) και δεν γράφει σετ.
 *
 * Reorder & grouping: οι γραμμές αναδιατάσσονται σε επίπεδο ΟΜΑΔΑΣ (μονή
 * άσκηση ή ολόκληρη αλυσίδα superset/dropset) με πάνω/κάτω, ώστε η σειρά να
 * παραμένει πάντα συνεπής με τις αλυσίδες. Το «σύνδεση με προηγούμενο»
 * ενώνει την τρέχουσα ομάδα με την ακριβώς προηγούμενη σε μία αλυσίδα.
 */
export function ProgramDetailPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { programId = '' } = useParams();

  const data = useLiveQuery(() => getProgramWithExercises(programId), [programId]);
  const adherence = useLiveQuery(() => getProgramAdherence(programId), [programId]);
  const allExercises = useLiveQuery(() => listExercises(), [], []);
  const exerciseById = useMemo(
    () => new Map(allExercises.map((e) => [e.id, e])),
    [allExercises],
  );

  const [pickerOpen, setPickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);

  if (!data) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  const { program, exercises } = data;
  const groups = groupProgramExercises(exercises);

  const persistOrder = async (nextGroups: ProgramGroup[]) => {
    await reorderProgramExercises(flattenGroupOrder(nextGroups));
  };

  const moveGroup = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= groups.length) return;
    const a = groups[index];
    const b = groups[target];
    if (!a || !b) return;
    const next = [...groups];
    next[index] = b;
    next[target] = a;
    await persistOrder(next);
  };

  const linkWithPrevious = async (index: number) => {
    if (index <= 0) return;
    const prev = groups[index - 1];
    const cur = groups[index];
    if (!prev || !cur) return;
    const key = prev.kind === 'single' ? uuid() : prev.key;
    const merged: ProgramGroup = {
      key,
      kind: 'superset',
      items: [...prev.items, ...cur.items],
    };
    await Promise.all(
      merged.items.map((item) => updateProgramExercise(item.id, { group_key: key })),
    );
    await persistOrder([...groups.slice(0, index - 1), merged, ...groups.slice(index + 1)]);
  };

  const unlinkItem = async (group: ProgramGroup, itemId: string) => {
    await updateProgramExercise(itemId, { group_key: null });
    const remaining = group.items.filter((i) => i.id !== itemId);
    const last = remaining.length === 1 ? remaining[0] : null;
    if (last) {
      await updateProgramExercise(last.id, { group_key: null });
    }
  };

  const deleteItem = async (group: ProgramGroup, itemId: string) => {
    await removeProgramExercise(itemId);
    const remaining = group.items.filter((i) => i.id !== itemId);
    const last = remaining.length === 1 ? remaining[0] : null;
    if (last) {
      await updateProgramExercise(last.id, { group_key: null });
    }
  };

  const onPickMany = async (exercises: Exercise[]) => {
    await addProgramExercisesBulk(
      program.id,
      exercises.map((e) => e.id),
      { target_sets: 3 },
    );
  };

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const started = await startWorkoutFromProgram(program.id);
      if (started) navigate('/workout');
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link to="/programs" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t('programs.title')}
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{program.name}</h1>
          <span className="text-xs text-muted-foreground">
            {t(`activity.${program.activity_kind}`)}
          </span>
        </div>

        {/* Στόχος συχνότητας/εβδομάδα — habit nudge για casual, adherence για serious */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{t('programs.weeklyTarget')}:</span>
          <button
            type="button"
            aria-label={t('programs.decrease')}
            onClick={() =>
              void setProgramTarget(
                program.id,
                Math.max(0, (program.target_sessions_per_week ?? 0) - 1) || null,
              )
            }
            className="h-7 w-7 rounded-md border border-border text-muted-foreground hover:bg-accent"
          >
            −
          </button>
          <span className="w-6 text-center font-mono">
            {program.target_sessions_per_week ?? '—'}
          </span>
          <button
            type="button"
            aria-label={t('programs.increase')}
            onClick={() =>
              void setProgramTarget(program.id, (program.target_sessions_per_week ?? 0) + 1)
            }
            className="h-7 w-7 rounded-md border border-border text-muted-foreground hover:bg-accent"
          >
            +
          </button>
          {adherence && (
            <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 font-mono text-xs text-primary">
              {adherence.completedThisWeek}/{adherence.target} {t('programs.thisWeek')}
            </span>
          )}
        </div>
      </header>

      <Button
        className="w-full"
        onClick={() => void onStart()}
        disabled={starting || exercises.length === 0}
      >
        <Play className="h-4 w-4" />
        {t('programs.start')}
      </Button>

      {exercises.length === 0 ? (
        <p className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t('programs.noExercises')}
        </p>
      ) : (
        <ul className="space-y-3">
          {groups.map((group, index) => (
            <li key={group.key}>
              <div
                className={cn(
                  'overflow-hidden rounded-lg border',
                  group.kind !== 'single'
                    ? 'border-primary/50 bg-primary/5'
                    : 'border-border bg-card',
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {group.kind !== 'single' &&
                      t(group.kind === 'dropset' ? 'setType.dropset' : 'setType.superset')}
                  </span>
                  <div className="flex items-center gap-1">
                    {index > 0 && (
                      <button
                        type="button"
                        onClick={() => void linkWithPrevious(index)}
                        aria-label={t('programs.linkPrevious')}
                        className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                      >
                        <Link2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void moveGroup(index, -1)}
                      disabled={index === 0}
                      aria-label={t('programs.moveUp')}
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveGroup(index, 1)}
                      disabled={index === groups.length - 1}
                      aria-label={t('programs.moveDown')}
                      className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronDown className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-border/60">
                  {group.items.map((item) => {
                    const exercise = exerciseById.get(item.exercise_id);
                    if (!exercise) return null;
                    return (
                      <ProgramExerciseRow
                        key={item.id}
                        item={item}
                        exercise={exercise}
                        showUnlink={group.kind !== 'single'}
                        onUnlink={() => void unlinkItem(group, item.id)}
                        onDelete={() => void deleteItem(group, item.id)}
                      />
                    );
                  })}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" className="w-full" onClick={() => setPickerOpen(true)}>
        <Plus className="h-4 w-4" />
        {t('workout.addExercise')}
      </Button>

      <ExercisePickerSheet
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        mode="multi"
        onPick={() => {}}
        onPickMany={(list) => void onPickMany(list)}
      />
    </div>
  );
}
