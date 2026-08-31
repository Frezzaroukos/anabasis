import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Play, Plus, Trash2, History, ListChecks, LayoutTemplate } from 'lucide-react';
import {
  createProgram,
  duplicateProgram,
  listActivities,
  listPrograms,
  programFromLastWorkout,
  renameProgram,
  softDeleteProgram,
  startWorkoutFromProgram,
  createProgramFromTemplate,
} from '@/lib/db/queries';
import { PROGRAM_TEMPLATES } from '@/lib/programTemplates';
import { db } from '@/lib/db';
import type { ActivityKind, ProgramDay } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { ActivityChip } from '@/components/ActivityChip';

/**
 * Λίστα προγραμμάτων — πρότυπα προπόνησης που ο αθλητής φτιάχνει μία φορά και
 * ξαναχρησιμοποιεί. Το "Έναρξη" ξεκινά workout από το πρόγραμμα (queries.startWorkoutFromProgram
 * ΔΕΝ γράφει σετ, μόνο δίνει το πλάνο).
 */
export function ProgramsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const programs = useLiveQuery(() => listPrograms(), [], []);
  // Οι δραστηριότητες του ΧΡΗΣΤΗ (καμία σταθερή λίστα) — ίδια πηγή με τον
  // logger· ό,τι φτιάξει στο «Δραστηριότητες» εμφανίζεται κι εδώ.
  const activities = useLiveQuery(() => listActivities(true), [], []);
  const exerciseCounts = useLiveQuery(
    async () => {
      const rows = await db.program_exercises.toArray();
      const m = new Map<string, number>();
      for (const r of rows) m.set(r.program_id, (m.get(r.program_id) ?? 0) + 1);
      return m;
    },
    [],
    new Map<string, number>(),
  );
  // v12: μέρες ανά πρόγραμμα — δείχνει «Upper, Lower» αντί για μετρήματα ασκήσεων
  // σε δομημένα προγράμματα, σαν λίστα ρουτινών.
  const programDays = useLiveQuery(
    async () => {
      const rows = await db.program_days.toArray();
      const m = new Map<string, ProgramDay[]>();
      for (const r of rows) m.set(r.program_id, [...(m.get(r.program_id) ?? []), r]);
      for (const arr of m.values()) arr.sort((a, b) => a.position - b.position);
      return m;
    },
    [],
    new Map<string, ProgramDay[]>(),
  );

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ActivityKind>('strength');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [templatesOpen, setTemplatesOpen] = useState(false);

  const onPickTemplate = async (templateId: string) => {
    if (busy) return;
    const tpl = PROGRAM_TEMPLATES.find((x) => x.id === templateId);
    if (!tpl) return;
    setBusy(true);
    try {
      const p = await createProgramFromTemplate({
        name: t(tpl.nameKey),
        exercises: tpl.exercises,
      });
      setTemplatesOpen(false);
      navigate(`/programs/${p.id}`);
    } finally {
      setBusy(false);
    }
  };

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const p = await createProgram(trimmed, kind);
      setCreating(false);
      setName('');
      setKind('strength');
      navigate(`/programs/${p.id}`);
    } finally {
      setBusy(false);
    }
  };

  const onFromLastWorkout = async () => {
    const trimmed = name.trim() || t('programs.lastWorkoutCopyName');
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const p = await programFromLastWorkout(trimmed);
      if (!p) {
        setError(t('programs.noCompletedWorkout'));
        return;
      }
      setCreating(false);
      setName('');
      navigate(`/programs/${p.id}`);
    } finally {
      setBusy(false);
    }
  };

  // Δομημένο πρόγραμμα (έχει μέρες) → δεν ξέρουμε ΠΟΙΑ μέρα, πάμε στον editor να
  // διαλέξει· flat πρόγραμμα (καμία μέρα) → ξεκινά κατευθείαν όπως πριν το v12.
  const onStart = async (programId: string) => {
    if ((programDays.get(programId)?.length ?? 0) > 0) {
      navigate(`/programs/${programId}`);
      return;
    }
    const started = await startWorkoutFromProgram(programId);
    if (started) navigate('/workout/active');
  };

  // Fork: «Upper A» → «Upper A (2)», μετά ανοίγει τον editor για μετονομασία/αλλαγές.
  const onDuplicate = async (programId: string) => {
    const copy = await duplicateProgram(programId);
    if (copy) navigate(`/programs/${copy.id}`);
  };

  const onConfirmRename = async (id: string) => {
    const trimmed = renameDraft.trim();
    if (trimmed) await renameProgram(id, trimmed);
    setRenamingId(null);
  };

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t('programs.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono tabular-nums">{programs.length}</span>{' '}
            {t('programs.title').toLowerCase()}
          </p>
        </div>
        {!creating && (
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setTemplatesOpen((v) => !v)}>
              <LayoutTemplate className="h-4 w-4" />
              {t('programs.fromTemplate')}
            </Button>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" />
              {t('programs.newProgram')}
            </Button>
          </div>
        )}
      </header>

      {templatesOpen && (
        <section className="animate-rise-in space-y-2 rounded-lg bg-elevated p-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t('programs.templatesHint')}
          </p>
          <ul className="grid gap-2">
            {PROGRAM_TEMPLATES.map((tpl) => (
              <li key={tpl.id}>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onPickTemplate(tpl.id)}
                  className="w-full rounded-lg bg-card p-3 text-left ring-offset-background transition-all duration-150 hover:bg-accent active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-50"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-medium">{t(tpl.nameKey)}</span>
                    <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                      {tpl.exercises.length} {t('programs.exercisesShort')} · {tpl.daysPerWeek}×
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t(tpl.descriptionKey)}</p>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {creating && (
        <section className="animate-rise-in space-y-3 rounded-lg bg-elevated p-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('programs.namePlaceholder')}
            aria-label={t('programs.namePlaceholder')}
          />
          <div className="flex flex-wrap gap-2">
            {activities.map((a) => (
              <ActivityChip
                key={a.key}
                activity={a}
                selected={kind === a.key}
                onClick={() => setKind(a.key)}
              />
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!name.trim() || busy} onClick={() => void onCreate()}>
              {t('common.save')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onFromLastWorkout()}
            >
              <History className="h-4 w-4" />
              {t('programs.fromLastWorkout')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setCreating(false);
                setName('');
                setError(null);
              }}
            >
              {t('common.cancel')}
            </Button>
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </section>
      )}

      {programs.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ListChecks className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-medium">{t('programs.empty')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('programs.emptyHint')}</p>
          </div>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t('programs.newProgram')}
          </Button>
        </div>
      ) : (
        <ul className="stagger space-y-2">
          {programs.map((p) => (
            <li key={p.id} className="rounded-lg bg-card p-3">
              {renamingId === p.id ? (
                <div className="flex gap-2">
                  <Input
                    autoFocus
                    value={renameDraft}
                    onChange={(e) => setRenameDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onConfirmRename(p.id);
                      if (e.key === 'Escape') setRenamingId(null);
                    }}
                    className="h-9"
                  />
                  <Button size="sm" onClick={() => void onConfirmRename(p.id)}>
                    {t('common.save')}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenamingId(null)}>
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3">
                  <Link
                    to={`/programs/${p.id}`}
                    className="min-w-0 flex-1 rounded-md ring-offset-background transition-all duration-150 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <p className="truncate font-display text-sm font-semibold">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {activities.find((a) => a.key === p.activity_kind)?.label ?? p.activity_kind}
                      {' · '}
                      {(programDays.get(p.id)?.length ?? 0) > 0 ? (
                        <span className="font-mono">
                          {t('programs.dayCount', { count: programDays.get(p.id)!.length })}
                          {' · '}
                          {programDays
                            .get(p.id)!
                            .map((d) => d.name)
                            .join(', ')}
                        </span>
                      ) : (
                        <span className="font-mono">
                          {exerciseCounts.get(p.id) ?? 0} {t('workout.exercises').toLowerCase()}
                        </span>
                      )}
                    </p>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setRenamingId(p.id);
                        setRenameDraft(p.name);
                      }}
                    >
                      {t('common.edit')}
                    </Button>
                    <button
                      type="button"
                      onClick={() => void onDuplicate(p.id)}
                      aria-label={t('programs.duplicate')}
                      className="rounded-md p-2 text-muted-foreground ring-offset-background transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(p.id)}
                      aria-label={t('common.delete')}
                      className="rounded-md p-2 text-muted-foreground ring-offset-background transition-all duration-150 hover:bg-destructive hover:text-destructive-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <Button size="sm" onClick={() => void onStart(p.id)}>
                      <Play className="h-4 w-4" />
                      {t('programs.start')}
                    </Button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={deleteId != null}
        title={t('programs.deleteConfirmTitle')}
        description={t('programs.deleteConfirmDesc')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          if (deleteId) void softDeleteProgram(deleteId);
          setDeleteId(null);
        }}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
