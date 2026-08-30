import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuid } from 'uuid';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Link2,
  Pencil,
  Play,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  addProgramExercise,
  createProgramDay,
  deleteProgramDay,
  getProgramAdherence,
  getProgramDayWithExercises,
  getProgramWithExercises,
  listProgramDays,
  renameProgramDay,
  reorderProgramDays,
  setProgramTarget,
  listExercises,
  removeProgramExercise,
  reorderProgramExercises,
  startWorkoutFromProgram,
  startWorkoutFromProgramDay,
  updateProgramExercise,
} from '@/lib/db/queries';
import type { Exercise } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ExercisePickerSheet } from './components/ExercisePickerSheet';
import { ProgramExerciseRow } from './components/ProgramExerciseRow';
import { flattenGroupOrder, groupProgramExercises, type ProgramGroup } from './utils';
import { cn } from '@/lib/utils';

/**
 * Ο editor ενός προγράμματος — «πρότυπο», όχι προπόνηση. Δουλεύει πάνω σε
 * στόχους (target_sets/reps/weight/hold) και δεν γράφει σετ.
 *
 * v12: πρόγραμμα → μέρες (program_days) → ασκήσεις. Ένα πρόγραμμα ΧΩΡΙΣ μέρες
 * δείχνει μία σιωπηρή μέρα (program_day_id null) όπως πριν· «+ Προσθήκη
 * ημερών» τη μετατρέπει σε δομημένη (πρώτη μέρα + μεταφορά των υπαρχόντων
 * γραμμών σε αυτή). Η ενεργή καρτέλα μέρας ορίζει πού πάνε οι νέες ασκήσεις.
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
  const days = useLiveQuery(() => listProgramDays(programId), [programId], []);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [activeDayId, setActiveDayId] = useState<string | null>(null);
  const [addingDay, setAddingDay] = useState(false);
  const [newDayName, setNewDayName] = useState('');
  const [dayBusy, setDayBusy] = useState(false);
  const [renamingDayId, setRenamingDayId] = useState<string | null>(null);
  const [renameDayDraft, setRenameDayDraft] = useState('');
  const [deleteDayId, setDeleteDayId] = useState<string | null>(null);

  // Όταν φορτώνουν/αλλάζουν οι μέρες, κράτα την ενεργή έγκυρη — προεπιλογή στην
  // πρώτη μέρα αν υπάρχουν μέρες, αλλιώς σιωπηρή μέρα (null = flat πρόγραμμα).
  useEffect(() => {
    if (days.length === 0) {
      if (activeDayId != null) setActiveDayId(null);
      return;
    }
    if (activeDayId == null || !days.some((d) => d.id === activeDayId)) {
      setActiveDayId(days[0]!.id);
    }
  }, [days, activeDayId]);

  const dayId = days.length > 0 ? activeDayId : null;
  const activeDayData = useLiveQuery(
    () => (dayId ? getProgramDayWithExercises(dayId) : null),
    [dayId],
  );

  if (!data) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  const { program } = data;
  const structured = days.length > 0;
  const activeDay = structured ? (days.find((d) => d.id === activeDayId) ?? null) : null;
  // structured + μέρα ακόμα δεν έχει φορτώσει → κενή λίστα προσωρινά (όχι το flat πλάνο).
  const exercises = structured ? (activeDayData?.exercises ?? []) : data.exercises;
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

  // Στοχεύει την ενεργή μέρα (ή null = flat πρόγραμμα, όπως πριν το v12).
  const onPickMany = async (picked: Exercise[]) => {
    await Promise.all(
      picked.map((e) =>
        addProgramExercise(program.id, {
          exercise_id: e.id,
          program_day_id: activeDayId,
          target_sets: 3,
        }),
      ),
    );
  };

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      const started = await startWorkoutFromProgram(program.id);
      if (started) navigate('/workout/active');
    } finally {
      setStarting(false);
    }
  };

  const onStartDay = async () => {
    if (starting || !activeDayId) return;
    setStarting(true);
    try {
      const started = await startWorkoutFromProgramDay(activeDayId);
      if (started) navigate('/workout/active');
    } finally {
      setStarting(false);
    }
  };

  // «+ Μέρα» σε δομημένο πρόγραμμα: κενή νέα μέρα. Σε flat πρόγραμμα (καμία
  // μέρα ακόμα) = «split»: η πρώτη μέρα παίρνει όλες τις υπάρχουσες γραμμές.
  const onAddDay = async () => {
    const trimmed = newDayName.trim();
    if (!trimmed || dayBusy) return;
    setDayBusy(true);
    try {
      const wasFlat = days.length === 0;
      const day = await createProgramDay(program.id, trimmed);
      if (wasFlat) {
        await Promise.all(
          data.exercises.map((item) =>
            updateProgramExercise(item.id, { program_day_id: day.id }),
          ),
        );
      }
      setAddingDay(false);
      setNewDayName('');
      setActiveDayId(day.id);
    } finally {
      setDayBusy(false);
    }
  };

  const onConfirmRenameDay = async (id: string) => {
    const trimmed = renameDayDraft.trim();
    if (trimmed) await renameProgramDay(id, trimmed);
    setRenamingDayId(null);
  };

  const moveDay = async (dir: -1 | 1) => {
    const index = days.findIndex((d) => d.id === activeDayId);
    if (index < 0) return;
    const target = index + dir;
    if (target < 0 || target >= days.length) return;
    const a = days[index];
    const b = days[target];
    if (!a || !b) return;
    const next = [...days];
    next[index] = b;
    next[target] = a;
    await reorderProgramDays(
      program.id,
      next.map((d) => d.id),
    );
  };

  const onDeleteDay = async (id: string) => {
    await deleteProgramDay(id);
    setActiveDayId(null);
    setDeleteDayId(null);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link to="/programs" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t('programs.title')}
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">{program.name}</h1>
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
            className="h-7 w-7 rounded-md bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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
            className="h-7 w-7 rounded-md bg-muted text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
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

      {/* Μέρες (v12): tabs σαν ρουτίνες Hevy. Χωρίς μέρες = flat πρόγραμμα, όπως πριν. */}
      {structured ? (
        <section className="space-y-3">
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {days.map((day, index) => (
              <button
                key={day.id}
                type="button"
                onClick={() => setActiveDayId(day.id)}
                aria-label={`${t('programs.day')} ${index + 1}: ${day.name}`}
                aria-pressed={day.id === activeDayId}
                className={cn(
                  'shrink-0 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  day.id === activeDayId
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                )}
              >
                {day.name}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setAddingDay(true)}
              aria-label={t('programs.addDay')}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {addingDay && (
            <div className="animate-rise-in flex gap-2 rounded-lg bg-elevated p-3">
              <Input
                autoFocus
                value={newDayName}
                onChange={(e) => setNewDayName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onAddDay();
                  if (e.key === 'Escape') setAddingDay(false);
                }}
                placeholder={t('programs.dayNamePlaceholder')}
                aria-label={t('programs.dayNamePlaceholder')}
                className="h-9"
              />
              <Button size="sm" disabled={!newDayName.trim() || dayBusy} onClick={() => void onAddDay()}>
                {t('common.save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAddingDay(false)}>
                {t('common.cancel')}
              </Button>
            </div>
          )}

          {activeDay && (
            <div className="flex items-center justify-between gap-2">
              {renamingDayId === activeDay.id ? (
                <div className="flex flex-1 gap-2">
                  <Input
                    autoFocus
                    value={renameDayDraft}
                    onChange={(e) => setRenameDayDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onConfirmRenameDay(activeDay.id);
                      if (e.key === 'Escape') setRenamingDayId(null);
                    }}
                    aria-label={t('programs.dayNamePlaceholder')}
                    className="h-9"
                  />
                  <Button size="sm" onClick={() => void onConfirmRenameDay(activeDay.id)}>
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenamingDayId(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <>
                  <h2 className="font-display text-lg font-semibold tracking-tight">
                    {activeDay.name}
                  </h2>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void moveDay(-1)}
                      disabled={days.findIndex((d) => d.id === activeDayId) === 0}
                      aria-label={t('programs.moveDayLeft')}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveDay(1)}
                      disabled={days.findIndex((d) => d.id === activeDayId) === days.length - 1}
                      aria-label={t('programs.moveDayRight')}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRenamingDayId(activeDay.id);
                        setRenameDayDraft(activeDay.name);
                      }}
                      aria-label={t('programs.renameDay')}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteDayId(activeDay.id)}
                      aria-label={t('programs.deleteDay')}
                      className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => void onStartDay()}
            disabled={starting || !activeDayId || exercises.length === 0}
          >
            <Play className="h-4 w-4" />
            {t('programs.startDay')}
          </Button>
        </section>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setAddingDay(true)}
            className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
          >
            + {t('programs.addDays')}
          </button>

          {addingDay && (
            <div className="animate-rise-in space-y-2 rounded-lg bg-elevated p-3">
              <p className="text-xs text-muted-foreground">{t('programs.addDaysHint')}</p>
              <div className="flex gap-2">
                <Input
                  autoFocus
                  value={newDayName}
                  onChange={(e) => setNewDayName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void onAddDay();
                    if (e.key === 'Escape') setAddingDay(false);
                  }}
                  placeholder={t('programs.dayNamePlaceholder')}
                  aria-label={t('programs.dayNamePlaceholder')}
                  className="h-9"
                />
                <Button
                  size="sm"
                  disabled={!newDayName.trim() || dayBusy}
                  onClick={() => void onAddDay()}
                >
                  {t('common.save')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAddingDay(false)}>
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}

          <Button
            className="w-full"
            onClick={() => void onStart()}
            disabled={starting || exercises.length === 0}
          >
            <Play className="h-4 w-4" />
            {t('programs.start')}
          </Button>
        </>
      )}

      {exercises.length === 0 ? (
        <p className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
          {t('programs.noExercises')}
        </p>
      ) : (
        <ul className="stagger space-y-3">
          {groups.map((group, index) => (
            <li key={group.key}>
              <div
                className={cn(
                  'overflow-hidden rounded-lg',
                  group.kind !== 'single' ? 'bg-primary/5' : 'bg-card',
                )}
              >
                <div className="flex items-center justify-between gap-2 border-b border-border/40 px-3 py-1.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                    {group.kind !== 'single' &&
                      t(group.kind === 'dropset' ? 'setType.dropset' : 'setType.superset')}
                  </span>
                  {/* Πιο ήσυχα affordances: διακριτικά ως ηρεμία, ξεκάθαρα στο hover. */}
                  <div className="flex items-center gap-1 opacity-70 transition-opacity hover:opacity-100">
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

      <ConfirmDialog
        open={deleteDayId != null}
        title={t('programs.deleteDayConfirmTitle')}
        description={t('programs.deleteDayConfirmDesc')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          if (deleteDayId) void onDeleteDay(deleteDayId);
        }}
        onCancel={() => setDeleteDayId(null)}
      />
    </div>
  );
}
