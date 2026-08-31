import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowLeft, ChevronRight, Pencil, Trophy } from 'lucide-react';
import { getWorkoutDetail } from '@/lib/db/queries';
import { formatHMS } from '@/hooks/useSessionTimer';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight, toDisplayWeight } from '@/lib/units';
import { formatLoad } from '@/features/workout/utils';
import type { PRType } from '@/lib/db/types';
import { Card, SectionTitle } from '@/components/ui/Section';
import { cn } from '@/lib/utils';
import { EditWorkoutSheet } from './components/EditWorkoutSheet';

/** PR types που είναι βάρος (kg storage) — τα υπόλοιπα (reps/hold/απόσταση/pace) δεν μετατρέπονται. */
const WEIGHT_PR_TYPES: ReadonlySet<PRType> = new Set(['max_weight', 'max_volume', 'e1rm']);

/**
 * Μία προπόνηση, όπως τη διαβάζεις εκ των υστέρων.
 *
 * Έλειπε εντελώς: το ημερολόγιο και το ιστορικό έδειχναν ότι κάτι έγινε,
 * αλλά δεν υπήρχε τρόπος να δεις ΤΙ. Κάθε άσκηση εδώ είναι σύνδεσμος προς
 * την πρόοδό της, ώστε το «τι σήκωσα» να οδηγεί στο «πώς πάω».
 */
export function WorkoutDetailPage() {
  const { t, i18n } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const { workoutId } = useParams<{ workoutId: string }>();
  const [editOpen, setEditOpen] = useState(false);
  const detail = useLiveQuery(
    () => (workoutId ? getWorkoutDetail(workoutId) : Promise.resolve(null)),
    [workoutId],
    undefined,
  );

  if (detail === undefined) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{t('common.loading')}</p>;
  }
  if (detail === null) {
    return (
      <div className="space-y-4">
        <BackLink label={t('history.title')} />
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('history.notFound')}
        </p>
      </div>
    );
  }

  const { workout, activityLabel, exercises, totalVolume, totalSets, prs } = detail;
  const started = new Date(workout.started_at);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <BackLink label={t('history.title')} />
        <div className="flex items-start justify-between gap-3">
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {workout.workout_type ?? activityLabel}
          </h1>
          {/* Η διόρθωση ζει δίπλα σε αυτό που διορθώνεις, όχι σε άλλη οθόνη. */}
          <button
            onClick={() => setEditOpen(true)}
            aria-label={t('history.editWorkout')}
            className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border/70 text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <Pencil className="h-4 w-4" />
          </button>
        </div>
        <p className="text-sm text-muted-foreground">
          {started.toLocaleDateString(i18n.resolvedLanguage, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            year: 'numeric',
          })}
        </p>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat label={t('history.totalSets')} value={String(totalSets)} />
        <Stat
          label={t('history.volume')}
          value={totalVolume > 0 ? `${toDisplayWeight(totalVolume, unit, 'plate')}` : '—'}
          unit={totalVolume > 0 ? unit : undefined}
        />
        <Stat
          label={t('workout.duration')}
          value={workout.duration_seconds ? formatHMS(workout.duration_seconds) : '—'}
        />
      </div>

      {prs.length > 0 && (
        <Card className="border border-gold/40">
          <SectionTitle>{t('workout.prs')}</SectionTitle>
          <ul className="space-y-1.5">
            {prs.map((pr) => (
              <li key={pr.id} className="flex items-center gap-2 text-sm">
                <Trophy className="h-4 w-4 shrink-0 text-gold" />
                <span className="flex-1 truncate">{t(`history.pr.${pr.type}`)}</span>
                <span className="font-mono tabular-nums text-gold">
                  {WEIGHT_PR_TYPES.has(pr.type)
                    ? formatWeight(pr.value, unit)
                    : Math.round(pr.value * 10) / 10}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {exercises.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          {t('workout.noExercises')}
        </p>
      ) : (
        <div className="space-y-3">
          {exercises.map((ex) => (
            <Card key={ex.exerciseId}>
              <Link
                to={`/exercises/${ex.exerciseId}`}
                className="-mx-1 mb-2 flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{ex.name}</span>
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {formatWeight(ex.volume, unit, { granularity: 'plate' })}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>

              <ul className="divide-y divide-border/60">
                {ex.sets.map((s) => {
                  const warmup = s.set_type === 'warmup' || s.is_warmup;
                  return (
                    <li
                      key={s.id}
                      className={cn(
                        'flex items-center gap-3 py-1.5 font-mono text-sm',
                        warmup && 'text-muted-foreground',
                      )}
                    >
                      <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                        {s.set_number}
                      </span>
                      <span className="flex-1">
                        {[
                          s.weight_kg != null || s.bodyweight_kg != null
                            ? formatLoad(s.weight_kg, s.bodyweight_kg, unit)
                            : null,
                          s.reps != null ? `× ${s.reps}` : null,
                          s.hold_seconds != null ? `${s.hold_seconds}s` : null,
                        ]
                          .filter(Boolean)
                          .join(' ') || '—'}
                      </span>
                      {warmup && (
                        <span className="shrink-0 font-sans text-[10px] uppercase tracking-wide">
                          {t('setType.warmup')}
                        </span>
                      )}
                      {s.rpe != null && (
                        <span className="shrink-0 text-xs text-muted-foreground">
                          RPE {s.rpe}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <EditWorkoutSheet open={editOpen} onClose={() => setEditOpen(false)} workout={workout} />

      {workout.notes && (
        <Card>
          <SectionTitle>{t('workout.notes')}</SectionTitle>
          <p className="whitespace-pre-wrap text-sm">{workout.notes}</p>
        </Card>
      )}
    </div>
  );
}

function BackLink({ label }: { label: string }) {
  return (
    <Link
      to="/history"
      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      {label}
    </Link>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-lg bg-muted/40 px-3 py-2.5 text-center">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-lg tabular-nums leading-none">
        {value}
        {unit && <span className="ml-0.5 text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}
