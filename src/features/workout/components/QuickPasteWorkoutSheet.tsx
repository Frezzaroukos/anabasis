import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Check, ClipboardPaste } from 'lucide-react';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useExercises } from '@/hooks/useExercises';
import { useAppSettings } from '@/hooks/useAppSettings';
import { localDay } from '@/lib/db/queries';
import { savePastedWorkout, type SavePastedWorkoutResult } from '@/lib/db/workoutHelpers';
import { formatWeight } from '@/lib/units';
import { cn } from '@/lib/utils';
import { parseWorkoutNotes } from '../parseWorkoutNotes';

const CREATE_SENTINEL = '__create__';

interface QuickPasteWorkoutSheetProps {
  open: boolean;
  onClose: () => void;
  /** Αν δοθεί, προσθέτει τα σετ σε αυτή την προπόνηση. Αλλιώς φτιάχνει νέα προπόνηση. */
  workoutId?: string;
  /** Προεπιλεγμένη ημερομηνία YYYY-MM-DD όταν δημιουργείται νέα προπόνηση (από Calendar). */
  initialDate?: string;
  onSaved?: (result: SavePastedWorkoutResult) => void;
}

export function QuickPasteWorkoutSheet({
  open,
  onClose,
  workoutId,
  initialDate,
  onSaved,
}: QuickPasteWorkoutSheetProps) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const exercisesQuery = useExercises();
  const exercises = useMemo(() => exercisesQuery ?? [], [exercisesQuery]);
  const today = localDay();

  const [text, setText] = useState('');
  const [date, setDate] = useState(initialDate ?? today);
  const [workoutName, setWorkoutName] = useState('');
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? localDay());
    setError(false);
  }, [open, initialDate]);

  const parsedLines = useMemo(
    () => parseWorkoutNotes(text, exercises, unit),
    [text, exercises, unit],
  );

  const selectedLines = useMemo(
    () => parsedLines.filter((l) => !excluded.has(l.id)),
    [parsedLines, excluded],
  );

  const totalSets = useMemo(
    () => selectedLines.reduce((sum, l) => sum + l.sets.length, 0),
    [selectedLines],
  );

  const toggleLine = (id: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const resetAndClose = () => {
    setText('');
    setWorkoutName('');
    setOverrides({});
    setExcluded(new Set());
    setError(false);
    onClose();
  };

  const onSubmit = async () => {
    if (saving || selectedLines.length === 0) return;
    setSaving(true);
    setError(false);
    try {
      const lines = selectedLines.map((line) => {
        const chosen = overrides[line.id];
        const exerciseId =
          chosen === CREATE_SENTINEL
            ? null
            : chosen != null
              ? chosen
              : line.matchedExerciseId;
        return {
          exerciseId,
          newExerciseName: line.suggestedName,
          sets: line.sets,
          noteHint: exerciseId != null ? line.noteHint : null,
        };
      });

      const res = await savePastedWorkout({
        workoutId,
        date: workoutId ? undefined : date,
        workoutType: workoutId ? undefined : workoutName.trim() || null,
        lines,
        completeNewWorkout: true,
      });

      // Καλούμε πρώτα onSaved ώστε αν ο caller ακούει popstate για navigation,
      // να προλάβει το history.back() που πυροδοτεί το resetAndClose().
      onSaved?.(res);
      resetAndClose();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet open={open} onClose={onClose} title={t('workout.pasteNotesTitle')}>
      <div className="space-y-4 px-4 pb-6">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('workout.pasteNotesHint')}
        </p>

        {!workoutId && (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('history.workoutDate')}
              </span>
              <input
                type="date"
                value={date}
                max={today}
                onChange={(e) => setDate(e.target.value || today)}
                className="h-10 w-full rounded-md bg-elevated px-3 font-mono text-sm tabular-nums transition-colors focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {t('workout.pasteNotesWorkoutName')}
              </span>
              <Input
                value={workoutName}
                onChange={(e) => setWorkoutName(e.target.value)}
                placeholder={t('workout.typePlaceholder')}
                className="h-10 text-sm"
              />
            </label>
          </div>
        )}

        <textarea
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={t('workout.pasteNotesPlaceholder')}
          rows={6}
          aria-label={t('workout.pasteNotes')}
          className="min-h-[9rem] w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 font-mono text-base leading-relaxed focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
        />

        {parsedLines.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-xs text-muted-foreground">
            <ClipboardPaste className="h-4 w-4 shrink-0" aria-hidden />
            <span>{t('workout.pasteNotesEmpty')}</span>
          </div>
        ) : (
          <ul className="max-h-72 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/70 bg-card">
            {parsedLines.map((line) => {
              const isExcluded = excluded.has(line.id);
              const selectedValue =
                overrides[line.id] ?? line.matchedExerciseId ?? CREATE_SENTINEL;
              return (
                <li
                  key={line.id}
                  className={cn(
                    'space-y-2 p-3 transition-opacity',
                    isExcluded && 'opacity-45',
                    line.hasSuspectValues && !isExcluded && 'bg-amber-500/5',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!isExcluded}
                      onChange={() => toggleLine(line.id)}
                      className="h-5 w-5 shrink-0 accent-primary"
                      aria-label={line.rawName}
                    />
                    <select
                      value={selectedValue}
                      onChange={(e) =>
                        setOverrides((cur) => ({ ...cur, [line.id]: e.target.value }))
                      }
                      aria-label={t('workout.pasteNotesMatchExercise')}
                      className="h-9 min-w-0 flex-1 truncate rounded-md border border-border bg-elevated px-2 text-sm font-medium focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value={CREATE_SENTINEL}>
                        {t('workout.pasteNotesCreateNew', { name: line.suggestedName })}
                      </option>
                      {exercises.map((ex) => (
                        <option key={ex.id} value={ex.id}>
                          {ex.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap gap-1.5 pl-7">
                    {line.sets.map((s, idx) => {
                      const load =
                        s.weightKg != null
                          ? formatWeight(s.weightKg, unit, { withUnit: true })
                          : 'BW';
                      const reps = s.reps != null ? String(s.reps) : 'max';
                      const isDrop = s.setType === 'dropset';
                      const isAmrap = s.setType === 'amrap';
                      return (
                        <span
                          key={idx}
                          className={cn(
                            'inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-mono text-xs tabular-nums',
                            isDrop
                              ? 'border border-amber-500/40 bg-amber-500/10 text-foreground'
                              : isAmrap
                                ? 'border border-primary/40 bg-primary/10 text-foreground'
                                : 'bg-muted/60 text-foreground',
                          )}
                        >
                          {load} × {reps}
                          {isDrop && (
                            <span className="font-sans text-[10px] font-semibold uppercase text-amber-500">
                              drop
                            </span>
                          )}
                          {isAmrap && (
                            <span className="font-sans text-[10px] font-semibold uppercase text-primary">
                              amrap
                            </span>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {line.hasSuspectValues && (
                    <p className="flex items-center gap-1.5 pl-7 text-xs text-amber-500">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden />
                      {t('workout.pasteNotesSuspect')}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {error && (
          <p className="text-xs text-destructive" role="alert">
            {t('common.saveError')}
          </p>
        )}

        <div className="sticky bottom-0 -mx-4 border-t border-border/60 bg-card/95 px-4 pt-3 pb-1 backdrop-blur">
          <Button
            className="w-full"
            loading={saving}
            disabled={selectedLines.length === 0 || saving}
            onClick={() => void onSubmit()}
          >
            <Check className="h-4 w-4" />
            {t('workout.pasteNotesSave', {
              sets: totalSets,
              exercises: selectedLines.length,
            })}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
