import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Copy, Play, Plus, Trash2, History } from 'lucide-react';
import {
  createProgram,
  duplicateProgram,
  listPrograms,
  programFromLastWorkout,
  renameProgram,
  softDeleteProgram,
  startWorkoutFromProgram,
} from '@/lib/db/queries';
import { db } from '@/lib/db';
import type { ActivityKind } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const KINDS: ActivityKind[] = [
  'strength',
  'skill',
  'run',
  'basketball',
  'cycling',
  'swim',
  'mobility',
  'other',
];

/**
 * Λίστα προγραμμάτων — πρότυπα προπόνησης που ο αθλητής φτιάχνει μία φορά και
 * ξαναχρησιμοποιεί. Το "Έναρξη" ξεκινά workout από το πρόγραμμα (queries.startWorkoutFromProgram
 * ΔΕΝ γράφει σετ, μόνο δίνει το πλάνο).
 */
export function ProgramsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const programs = useLiveQuery(() => listPrograms(), [], []);
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

  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<ActivityKind>('strength');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);

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

  const onStart = async (programId: string) => {
    const started = await startWorkoutFromProgram(programId);
    if (started) navigate('/workout');
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
          <h1 className="text-2xl font-semibold tracking-tight">{t('programs.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {programs.length} {t('programs.title').toLowerCase()}
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t('programs.newProgram')}
          </Button>
        )}
      </header>

      {creating && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('programs.namePlaceholder')}
            aria-label={t('programs.namePlaceholder')}
          />
          <div className="flex flex-wrap gap-2">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
                  kind === k ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                )}
              >
                {t(`activity.${k}`)}
              </button>
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
        <div className="rounded-lg border border-border bg-card p-6 text-center text-sm text-muted-foreground">
          {t('programs.empty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {programs.map((p) => (
            <li key={p.id} className="rounded-lg border border-border bg-card p-3">
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
                  <Link to={`/programs/${p.id}`} className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t(`activity.${p.activity_kind}`)}
                      {' · '}
                      {exerciseCounts.get(p.id) ?? 0} {t('workout.exercises').toLowerCase()}
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
                      className="rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteId(p.id)}
                      aria-label={t('common.delete')}
                      className="rounded-md p-2 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
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
