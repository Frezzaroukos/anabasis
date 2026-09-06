import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { CalendarPlus, ChevronRight, Clock, Dumbbell, Layers, LineChart, Trophy } from 'lucide-react';
import { formatHMS } from '@/hooks/useSessionTimer';
import {
  getRecentPRs,
  listActivities,
  listAllExercises,
  listWorkoutSummaries,
  type WorkoutSummary,
} from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight } from '@/lib/units';
import type { PRType } from '@/lib/db/types';
import { SectionTitle } from '@/components/ui/Section';
import { VolumeChart } from './components/VolumeChart';
import { FeelChart } from './components/FeelChart';
import { Link } from 'react-router-dom';

/** PR types που είναι βάρος (kg storage) — τα υπόλοιπα δεν μετατρέπονται. */
const WEIGHT_PR_TYPES: ReadonlySet<PRType> = new Set(['max_weight', 'max_volume', 'e1rm']);

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';

  const completed = useLiveQuery(() => listWorkoutSummaries(), []);
  const list = completed ?? [];

  // Ομαδοποίηση ανά μήνα — ένα μεγάλο αδιάσπαστο feed χάνει τον χρόνο.
  const months = useMemo(() => {
    const groups = new Map<string, WorkoutSummary[]>();
    for (const s of list) {
      const key = s.workout.started_at.slice(0, 7); // YYYY-MM
      const arr = groups.get(key) ?? [];
      arr.push(s);
      groups.set(key, arr);
    }
    return [...groups.entries()];
  }, [list]);

  const prs = useLiveQuery(() => getRecentPRs(8), [], []);
  // listAllExercises (όχι db.exercises.toArray()): οι δικές σου ασκήσεις
  // δεν πρέπει να διαρρέουν στο ιστορικό άλλου προφίλ. Παίρνουμε ΚΑΙ τις
  // αρχειοθετημένες γιατί ένα PR μπορεί να αναφέρεται σε άσκηση που έκτοτε
  // αρχειοθέτησες.
  const exerciseNames = useLiveQuery(
    async () => new Map((await listAllExercises()).map((e) => [e.id, e.name])),
    [],
    new Map<string, string>(),
  );
  const activityLabels = useLiveQuery(
    async () => new Map((await listActivities(true)).map((a) => [a.key, a.label])),
    [],
    new Map<string, string>(),
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('history.title')}
        </h1>
        {list.length > 0 && (
          <p className="mt-1 font-mono text-sm tabular-nums text-muted-foreground">
            {list.length} {t('history.completed')}
          </p>
        )}
      </header>

      {/* Σύνδεσμος προς την πρόοδο ως κανονική σειρά (εικονίδιο + chevron), όχι
          ορφανό card με «→» σε κείμενο — ίδια γλώσσα με το hub των Ρυθμίσεων. */}
      {list.length > 0 && (
        <Link
          to="/progress"
          className="flex min-h-[3rem] items-center gap-3 rounded-xl bg-card px-4 py-3 text-sm transition-colors hover:bg-elevated active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <LineChart className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex-1">{t('progress.title')}</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
        </Link>
      )}

      <VolumeChart />
      <FeelChart />

      {prs.length > 0 && (
        <section>
          <SectionTitle>{t('history.recentPRs')}</SectionTitle>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
            {prs.map((pr) => (
              <li key={pr.id} className="flex min-h-[3rem] items-center gap-3 px-4 py-2.5">
                <Trophy className="h-4 w-4 shrink-0 text-gold" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {pr.exercise_id
                      ? (exerciseNames.get(pr.exercise_id) ?? '—')
                      : pr.activity_kind
                        ? (activityLabels.get(pr.activity_kind) ?? pr.activity_kind)
                        : '—'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t(`history.pr.${pr.type}`)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm tabular-nums">
                    {WEIGHT_PR_TYPES.has(pr.type)
                      ? formatWeight(pr.value, unit)
                      : Math.round(pr.value * 10) / 10}
                  </p>
                  <p className="font-mono text-[11px] tabular-nums text-muted-foreground">
                    {new Date(pr.achieved_at).toLocaleDateString(locale)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {list.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl bg-card px-6 py-10 text-center">
          <Dumbbell className="h-8 w-8 text-muted-foreground/60" aria-hidden />
          <p className="text-sm text-muted-foreground">{t('history.empty')}</p>
          <Link
            to="/calendar"
            className="mt-1 flex h-11 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <CalendarPlus className="h-4 w-4" aria-hidden />
            {t('history.logFirst')}
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {months.map(([key, items]) => (
            <section key={key}>
              <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                {new Date(`${key}-01T12:00:00`).toLocaleDateString(locale, {
                  month: 'long',
                  year: 'numeric',
                })}
              </h2>
              <ul className="stagger space-y-2">
                {items.map(({ workout: w, setCount, volume, topExercise }) => {
                  const activity = activityLabels.get(w.activity_kind) ?? w.activity_kind;
                  const hasMeta = setCount > 0 || volume > 0 || w.duration_seconds != null;
                  return (
                    <li key={w.id}>
                      <Link
                        to={`/history/${w.id}`}
                        className="block rounded-xl bg-card px-4 py-3 transition-colors hover:bg-elevated active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                      >
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="truncate text-sm font-medium">
                            {w.workout_type ?? activity}
                          </p>
                          <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                            {new Date(w.started_at).toLocaleDateString(locale, {
                              day: 'numeric',
                              month: 'short',
                            })}
                          </span>
                        </div>
                        {hasMeta && (
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-xs tabular-nums text-muted-foreground">
                            {setCount > 0 && (
                              <span className="flex items-center gap-1">
                                <Layers className="h-3 w-3" aria-hidden />
                                {setCount}
                              </span>
                            )}
                            {volume > 0 && <span>{formatWeight(volume, unit)}</span>}
                            {w.duration_seconds ? (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" aria-hidden />
                                {formatHMS(w.duration_seconds)}
                              </span>
                            ) : null}
                          </div>
                        )}
                        {topExercise && (
                          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
                            <Dumbbell className="h-3 w-3 shrink-0" aria-hidden />
                            {topExercise}
                          </p>
                        )}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
