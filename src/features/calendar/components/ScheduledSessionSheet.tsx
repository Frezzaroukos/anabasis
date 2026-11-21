import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, Trash2 } from 'lucide-react';
import type { Activity, ScheduledSession } from '@/lib/db/types';
import {
  createRecurringScheduledSessions,
  createScheduledSession,
  deleteScheduledSession,
  setScheduledSessionStatus,
  updateScheduledSession,
  type ScheduledSessionInput,
} from '@/lib/db/scheduledSessions';
import { localDay } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BottomSheet } from '@/components/ui/sheet';
import { ConfirmDialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface SchedulableProgram {
  id: string;
  name: string;
  days: Array<{ id: string; name: string }>;
}

interface ScheduledSessionSheetProps {
  onClose: () => void;
  /** Η ημερομηνία για νέο session· για edit χρησιμοποιείται του session. */
  date: string;
  /** null = δημιουργία. */
  session: ScheduledSession | null;
  programs: SchedulableProgram[];
  activities: Activity[];
  onStart: (session: ScheduledSession) => Promise<boolean>;
}

function initialProgramKey(
  session: ScheduledSession | null,
  programs: SchedulableProgram[],
): string {
  if (!session) return '';
  if (session.program_day_id) {
    const day = programs.flatMap((p) => p.days).find((d) => d.id === session.program_day_id);
    if (day) return `d:${day.id}`;
  }
  if (session.program_id && programs.some((p) => p.id === session.program_id)) {
    return `p:${session.program_id}`;
  }
  return '';
}

/**
 * Φόρμα planned session: δημιουργία (με προαιρετική εβδομαδιαία επανάληψη),
 * επεξεργασία, skip/restore, διαγραφή με confirm και «Ξεκίνα» που καλεί τον
 * ίδιο start δρόμο με το ημερολόγιο (program day / flat program / ad-hoc).
 *
 * Mount-άρεται μόνο όταν είναι ανοιχτή (key από τον caller), ώστε το form να
 * μη κρατά παλιές τιμές από προηγούμενη ημέρα/session.
 */
export function ScheduledSessionSheet({
  onClose,
  date,
  session,
  programs,
  activities,
  onStart,
}: ScheduledSessionSheetProps) {
  const { t, i18n } = useTranslation();
  const [title, setTitle] = useState(session?.title ?? '');
  const [sessionDate, setSessionDate] = useState(session?.date ?? date);
  const [time, setTime] = useState(session?.time ?? '');
  const [programKey, setProgramKey] = useState(initialProgramKey(session, programs));
  const [activityKind, setActivityKind] = useState(
    session?.activity_kind ?? 'strength',
  );
  const [notes, setNotes] = useState(session?.notes ?? '');
  const [weeks, setWeeks] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const today = localDay();
  const canStart =
    session != null &&
    session.status !== 'done' &&
    session.date <= today &&
    session.deleted_at == null;

  const selectedLabel = (key: string): string => {
    if (key.startsWith('p:')) {
      return programs.find((p) => p.id === key.slice(2))?.name ?? '';
    }
    if (key.startsWith('d:')) {
      return programs.flatMap((p) => p.days).find((d) => d.id === key.slice(2))?.name ?? '';
    }
    return '';
  };

  const onProgramChange = (value: string) => {
    setProgramKey(value);
    if (!title.trim()) {
      const label = selectedLabel(value);
      if (label) setTitle(label);
    }
  };

  const buildInput = (): ScheduledSessionInput => {
    let program_id: string | null = null;
    let program_day_id: string | null = null;
    if (programKey.startsWith('d:')) {
      program_day_id = programKey.slice(2);
      program_id =
        programs.find((p) => p.days.some((d) => d.id === program_day_id))?.id ?? null;
    } else if (programKey.startsWith('p:')) {
      program_id = programKey.slice(2);
    }
    return {
      date: sessionDate,
      time: time || null,
      title,
      program_id,
      program_day_id,
      activity_kind: program_id ? null : activityKind,
      notes: notes || null,
    };
  };

  const save = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const input = buildInput();
      if (session) {
        await updateScheduledSession(session.id, input);
      } else {
        if (weeks > 1) {
          await createRecurringScheduledSessions(input, weeks);
        } else {
          await createScheduledSession(input);
        }
      }
      onClose();
    } catch {
      setError(t('common.saveError'));
    } finally {
      setBusy(false);
    }
  };

  const toggleSkip = async () => {
    if (!session || busy) return;
    setBusy(true);
    try {
      await setScheduledSessionStatus(
        session.id,
        session.status === 'skipped' ? 'planned' : 'skipped',
      );
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!session) return;
    setConfirmDelete(false);
    setBusy(true);
    try {
      await deleteScheduledSession(session.id);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const start = async () => {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    try {
      const ok = await onStart(session);
      if (!ok) setError(t('calendar.startBlocked'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <BottomSheet
        open
        onClose={onClose}
        title={session ? t('calendar.editScheduled') : t('calendar.newScheduled')}
      >
        <div className="space-y-4 px-4 pb-5">
          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {error}
            </p>
          )}

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              {t('calendar.sessionTitle')}
            </span>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('calendar.sessionTitlePlaceholder')}
              className="h-11"
              autoFocus
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                {t('calendar.sessionDate')}
              </span>
              <input
                type="date"
                value={sessionDate}
                onChange={(e) => setSessionDate(e.target.value || date)}
                aria-label={t('calendar.sessionDate')}
                className="h-11 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs tabular-nums focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                {t('calendar.sessionTime')}
              </span>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                aria-label={t('calendar.sessionTime')}
                className="h-11 w-full rounded-md border border-input bg-background px-2.5 font-mono text-xs tabular-nums focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              {t('calendar.sessionProgram')}
            </span>
            <select
              value={programKey}
              onChange={(e) => onProgramChange(e.target.value)}
              aria-label={t('calendar.sessionProgram')}
              className="h-11 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('calendar.sessionNoProgram')}</option>
              {programs.map((program) => (
                <optgroup key={program.id} label={program.name}>
                  <option value={`p:${program.id}`}>
                    {program.days.length > 0
                      ? t('calendar.sessionWholeProgram', { name: program.name })
                      : program.name}
                  </option>
                  {program.days.map((day) => (
                    <option key={day.id} value={`d:${day.id}`}>
                      {day.name}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>

          {!programKey && (
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                {t('calendar.sessionActivity')}
              </span>
              <select
                value={activityKind}
                onChange={(e) => setActivityKind(e.target.value)}
                aria-label={t('calendar.sessionActivity')}
                className="h-11 w-full rounded-md border border-input bg-background px-2.5 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {activities.map((a) => (
                  <option key={a.key} value={a.key}>
                    {a.label}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
              {t('calendar.sessionNotes')}
            </span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t('calendar.sessionNotesPlaceholder')}
              rows={2}
              className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>

          {!session && (
            <label className="block">
              <span className="mb-1 block text-xs uppercase tracking-wide text-muted-foreground">
                {t('calendar.repeatWeeks')}
              </span>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={52}
                value={weeks}
                onChange={(e) => setWeeks(Math.min(52, Math.max(1, Number(e.target.value) || 1)))}
                className="h-11 font-mono tabular-nums"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {t('calendar.repeatWeeksHint', { count: weeks })}
              </span>
            </label>
          )}

          {session && (
            <p className="text-xs text-muted-foreground">
              {t('calendar.sessionStatusLabel')}:{' '}
              {t(`calendar.status.${session.status}`)}
              {session.status !== 'skipped' && (
                <span className="ml-2 font-mono text-xs">
                  {new Date(`${session.date}T12:00:00`).toLocaleDateString(
                    i18n.resolvedLanguage,
                  )}
                </span>
              )}
            </p>
          )}

          <div className={cn('flex flex-col gap-2 pt-1', 'sm:flex-row sm:justify-end')}>
            {session && (
              <div className="flex gap-2 sm:mr-auto">
                {session.status !== 'done' && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={busy}
                    onClick={() => void toggleSkip()}
                    className="flex-1 sm:flex-none"
                  >
                    {session.status === 'skipped'
                      ? t('calendar.sessionUnskip')
                      : t('calendar.sessionSkip')}
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                  className="flex-1 text-destructive hover:text-destructive sm:flex-none"
                  aria-label={t('calendar.sessionDeleteTitle')}
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </Button>
              </div>
            )}
            {canStart && session && (
              <Button
                type="button"
                variant="default"
                disabled={busy}
                onClick={() => void start()}
                className="gap-1.5"
              >
                <Play className="h-4 w-4" aria-hidden />
                {t('calendar.sessionStart')}
              </Button>
            )}
            <Button type="button" disabled={busy || !title.trim()} onClick={() => void save()}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </BottomSheet>

      <ConfirmDialog
        open={confirmDelete}
        title={t('calendar.sessionDeleteTitle')}
        description={t('calendar.sessionDeleteDesc')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void remove()}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
