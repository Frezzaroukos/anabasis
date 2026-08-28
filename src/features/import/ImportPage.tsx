import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Ban, Check } from 'lucide-react';
import { parseNotionCalories } from '@/lib/import/notionCalories';
import { parseNotionWeights } from '@/lib/importers/notionWeights';
import { parseStrongCsv } from '@/lib/importers/strongCsv';
import { parseHevyCsv } from '@/lib/importers/hevyCsv';
import {
  importWorkouts,
  previewExerciseMatch,
  type WorkoutImportResult,
} from '@/lib/importers/merge';
import type { BadRow, ImportedWorkout } from '@/lib/importers/types';
import { importBodyMetrics } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Εισαγωγή ιστορικών δεδομένων από τρίτες πηγές. Όλες οι πηγές είναι messy
 * (math, σχόλια, λάθη ημερομηνιών, δύο CSV διάλεκτοι του Strong), οπότε ΕΝΑ
 * μοτίβο παντού: preview με ΚΑΘΕ ύποπτη τιμή σημαδεμένη πριν το import —
 * ο χρήστης έχει τον έλεγχο, καμία σιωπηλή μαντεψιά.
 */

type Source = 'notion-calories' | 'notion-weights' | 'strong' | 'hevy';

const SOURCES: Array<{ id: Source; labelKey: string }> = [
  { id: 'notion-calories', labelKey: 'import.sourceNotionCalories' },
  { id: 'notion-weights', labelKey: 'import.sourceNotionWeights' },
  { id: 'strong', labelKey: 'import.sourceStrong' },
  { id: 'hevy', labelKey: 'import.sourceHevy' },
];

/** Κοινό σχήμα preview για τις daily πηγές (θερμίδες & βάρος). */
interface DailyRow {
  date: string;
  display: string;
  patch: { calories_in: number } | { weight_kg: number };
  needsReview: boolean;
  invalidDate: boolean;
  raw: string;
}

interface DailyResult {
  kind: 'daily';
  added: number;
  updated: number;
}
interface WorkoutsResult extends WorkoutImportResult {
  kind: 'workouts';
}

export function ImportPage() {
  const { t } = useTranslation();
  const [source, setSource] = useState<Source>('notion-calories');
  const [text, setText] = useState('');
  const [year, setYear] = useState(2025);
  const [result, setResult] = useState<DailyResult | WorkoutsResult | null>(null);
  const [busy, setBusy] = useState(false);
  // ό,τι ο χρήστης ξεδιάλεξε να ΜΗΝ εισαχθεί: ημερομηνίες (daily) ή workout keys
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const isDaily = source === 'notion-calories' || source === 'notion-weights';

  // Ένα parse ανά αλλαγή input — τα preview components δουλεύουν πάνω σε αυτό.
  const daily = useMemo<{ rows: DailyRow[] } | null>(() => {
    if (source === 'notion-calories') {
      const { rows } = parseNotionCalories(text, year);
      return {
        rows: rows.map((r) => ({
          date: r.date,
          display: String(r.calories),
          patch: { calories_in: r.calories },
          needsReview: r.needsReview,
          invalidDate: r.invalidDate,
          raw: r.raw,
        })),
      };
    }
    if (source === 'notion-weights') {
      const { rows } = parseNotionWeights(text, year);
      return {
        rows: rows.map((r) => ({
          date: r.date,
          display: `${r.weightKg}`,
          patch: { weight_kg: r.weightKg },
          needsReview: r.needsReview,
          invalidDate: r.invalidDate,
          raw: r.raw,
        })),
      };
    }
    return null;
  }, [source, text, year]);

  const parsed = useMemo<{ workouts: ImportedWorkout[]; badRows: BadRow[] } | null>(() => {
    if (source === 'strong') return parseStrongCsv(text);
    if (source === 'hevy') return parseHevyCsv(text);
    return null;
  }, [source, text]);

  // Ποιες ασκήσεις του αρχείου θα δημιουργηθούν ως νέες — ο χρήστης το
  // βλέπει στο preview, όχι ως έκπληξη μετά το import.
  const [missingExercises, setMissingExercises] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    const names = parsed?.workouts.flatMap((w) => w.exercises.map((e) => e.name)) ?? [];
    if (names.length === 0) {
      setMissingExercises([]);
      return;
    }
    void previewExerciseMatch(names).then(({ missing }) => {
      if (!cancelled) setMissingExercises(missing);
    });
    return () => {
      cancelled = true;
    };
  }, [parsed]);

  const switchSource = (s: Source) => {
    setSource(s);
    setText('');
    setExcluded(new Set());
    setResult(null);
  };

  const toggle = (key: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const onPickFile = async (f: File) => {
    setText(await f.text());
    setExcluded(new Set());
    setResult(null);
  };

  const dailyImportable = daily
    ? daily.rows.filter((r) => !r.invalidDate && !excluded.has(r.date))
    : [];
  const selectedWorkouts = parsed
    ? parsed.workouts.filter((w) => !excluded.has(w.key))
    : [];
  const selectedSetCount = selectedWorkouts.reduce(
    (n, w) => n + w.exercises.reduce((m, e) => m + e.sets.length, 0),
    0,
  );

  const onImport = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (isDaily && daily) {
        const res = await importBodyMetrics(
          dailyImportable.map((r) => ({ date: r.date, patch: r.patch })),
        );
        setResult({ kind: 'daily', ...res });
      } else if (parsed) {
        const res = await importWorkouts(selectedWorkouts);
        setResult({ kind: 'workouts', ...res });
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground">
          ← {t('settings.title')}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{t('import.title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('import.subtitle')}</p>
      </header>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap gap-1" role="tablist" aria-label={t('import.source')}>
          {SOURCES.map((s) => (
            <button
              key={s.id}
              role="tab"
              aria-selected={source === s.id}
              onClick={() => switchSource(s.id)}
              className={cn(
                'rounded-md border border-border px-3 py-1 text-sm transition-colors',
                source === s.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
              )}
            >
              {t(s.labelKey)}
            </button>
          ))}
        </div>

        {isDaily && (
          <div className="flex items-center gap-2">
            <label className="text-sm">{t('import.startYear')}</label>
            <div className="flex gap-1">
              {[2024, 2025, 2026].map((y) => (
                <button
                  key={y}
                  onClick={() => setYear(y)}
                  className={cn(
                    'rounded-md border border-border px-3 py-1 font-mono text-sm transition-colors',
                    year === y ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                  )}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={
            source === 'notion-calories'
              ? t('import.placeholder')
              : source === 'notion-weights'
                ? t('import.weightPlaceholder')
                : t('import.csvPlaceholder')
          }
          rows={8}
          className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-xs"
        />

        {!isDaily && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
              {t('import.chooseFile')}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onPickFile(f);
                e.target.value = '';
              }}
            />
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          {source === 'notion-calories' && t('import.formatHint')}
          {source === 'notion-weights' && t('import.weightHint')}
          {source === 'strong' && t('import.strongHint')}
          {source === 'hevy' && t('import.hevyHint')}
        </p>
      </section>

      {isDaily && daily && daily.rows.length > 0 && (
        <DailyPreview
          rows={daily.rows}
          excluded={excluded}
          onToggle={toggle}
          importableCount={dailyImportable.length}
          busy={busy}
          onImport={() => void onImport()}
        />
      )}

      {!isDaily && parsed && (parsed.workouts.length > 0 || parsed.badRows.length > 0) && (
        <WorkoutsPreview
          workouts={parsed.workouts}
          badRows={parsed.badRows}
          missingExercises={missingExercises}
          excluded={excluded}
          onToggle={toggle}
          selectedCount={selectedWorkouts.length}
          selectedSetCount={selectedSetCount}
          busy={busy}
          onImport={() => void onImport()}
        />
      )}

      {result && (
        <div
          className="flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 p-4 text-sm"
          role="status"
        >
          <Check className="h-4 w-4 shrink-0 text-primary" />
          {result.kind === 'daily'
            ? t('import.done', { added: result.added, updated: result.updated })
            : t('import.workoutsDone', {
                workouts: result.workoutsAdded,
                sets: result.setsAdded,
                exercises: result.exercisesCreated,
                duplicates: result.duplicatesSkipped,
              })}
        </div>
      )}
    </div>
  );
}

function DailyPreview({
  rows,
  excluded,
  onToggle,
  importableCount,
  busy,
  onImport,
}: {
  rows: DailyRow[];
  excluded: Set<string>;
  onToggle: (key: string) => void;
  importableCount: number;
  busy: boolean;
  onImport: () => void;
}) {
  const { t } = useTranslation();
  const reviewCount = rows.filter((r) => r.needsReview && !r.invalidDate).length;
  const invalidCount = rows.filter((r) => r.invalidDate).length;

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">
          {t('import.preview')} · {rows.length} {t('import.days')}
        </h2>
        <span className="flex items-center gap-3 text-xs">
          {reviewCount > 0 && (
            <span className="flex items-center gap-1 text-amber-500">
              <AlertTriangle className="h-3 w-3" />
              {reviewCount} {t('import.needReview')}
            </span>
          )}
          {invalidCount > 0 && (
            <span className="flex items-center gap-1 text-destructive">
              <Ban className="h-3 w-3" />
              {invalidCount} {t('import.invalidDates')}
            </span>
          )}
        </span>
      </div>

      <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
        {rows.map((r) => (
          <li
            key={`${r.date}-${r.raw}`}
            className={cn(
              'flex items-center gap-3 px-4 py-2 text-sm',
              (excluded.has(r.date) || r.invalidDate) && 'opacity-40',
              r.needsReview && !r.invalidDate && !excluded.has(r.date) && 'bg-amber-500/5',
            )}
          >
            <input
              type="checkbox"
              checked={!r.invalidDate && !excluded.has(r.date)}
              disabled={r.invalidDate}
              onChange={() => onToggle(r.date)}
              className="h-4 w-4 shrink-0 accent-primary"
              aria-label={r.date}
            />
            <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">{r.date}</span>
            <span className="w-16 shrink-0 font-mono">{r.display}</span>
            {r.invalidDate ? (
              <span className="flex min-w-0 items-center gap-1 text-xs text-destructive">
                <Ban className="h-3 w-3 shrink-0" />
                <span className="truncate">{t('import.invalidDate')}</span>
              </span>
            ) : (
              r.needsReview && (
                <span className="flex min-w-0 items-center gap-1 text-xs text-amber-500">
                  <AlertTriangle className="h-3 w-3 shrink-0" />
                  <span className="truncate">{r.raw}</span>
                </span>
              )
            )}
          </li>
        ))}
      </ul>

      <Button className="w-full" disabled={busy || importableCount === 0} onClick={onImport}>
        {t('import.doImport', { count: importableCount })}
      </Button>
    </section>
  );
}

function WorkoutsPreview({
  workouts,
  badRows,
  missingExercises,
  excluded,
  onToggle,
  selectedCount,
  selectedSetCount,
  busy,
  onImport,
}: {
  workouts: ImportedWorkout[];
  badRows: BadRow[];
  missingExercises: string[];
  excluded: Set<string>;
  onToggle: (key: string) => void;
  selectedCount: number;
  selectedSetCount: number;
  busy: boolean;
  onImport: () => void;
}) {
  const { t } = useTranslation();

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">
          {t('import.preview')} · {workouts.length} {t('import.workouts')} · {selectedSetCount}{' '}
          {t('import.sets')}
        </h2>
        {badRows.length > 0 && (
          <span className="flex items-center gap-1 text-xs text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            {badRows.length} {t('import.badRows')}
          </span>
        )}
      </div>

      {missingExercises.length > 0 && (
        <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
          {t('import.willCreateExercises', { count: missingExercises.length })}{' '}
          <span className="font-mono">{missingExercises.join(', ')}</span>
        </p>
      )}

      <ul className="max-h-96 divide-y divide-border overflow-y-auto rounded-lg border border-border bg-card">
        {workouts.map((w) => {
          const setCount = w.exercises.reduce((n, e) => n + e.sets.length, 0);
          const suspects = w.exercises.flatMap((e) => e.sets.filter((s) => s.suspect));
          return (
            <li
              key={w.key}
              className={cn('px-4 py-2 text-sm', excluded.has(w.key) && 'opacity-40')}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!excluded.has(w.key)}
                  onChange={() => onToggle(w.key)}
                  className="h-4 w-4 shrink-0 accent-primary"
                  aria-label={w.date}
                />
                <span className="w-24 shrink-0 font-mono text-xs text-muted-foreground">
                  {w.date}
                </span>
                <span className="min-w-0 flex-1 truncate">{w.name ?? '—'}</span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                  {w.exercises.length}×{setCount}
                </span>
              </div>
              {suspects.length > 0 && !excluded.has(w.key) && (
                <ul className="mt-1 space-y-0.5 pl-7">
                  {suspects.map((s, i) => (
                    <li
                      key={i}
                      className="flex items-center gap-1 text-xs text-amber-500"
                    >
                      <AlertTriangle className="h-3 w-3 shrink-0" />
                      <span className="truncate">{s.raw}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      <Button className="w-full" disabled={busy || selectedCount === 0} onClick={onImport}>
        {t('import.doImportWorkouts', { count: selectedCount })}
      </Button>
    </section>
  );
}
