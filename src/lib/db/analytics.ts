/**
 * Pure training-analytics math (no Dexie, no React).
 *
 * Χρησιμοποιείται από το `analyticsQueries.ts` (DB) και τα charts της
 * Προόδου. Κρατά τους υπολογισμούς εκτός components ώστε να είναι
 * unit-testable και να μην ξαναϋπολογίζονται με διαφορετικό τρόπο σε κάθε
 * chart:
 *  - weekly volume: Σ (βάρος + σωματικό βάρος) × reps, σε Δευτέρα-εβδομάδες
 *  - weekly frequency: πλήθος προπονήσεων ανά εβδομάδα
 *  - category split: working σετ ανά κατηγορία άσκησης
 *  - PR timeline: σωρευτικά PR ανά ημέρα
 *
 * Οι ημερομηνίες είναι ΠΑΝΤΑ τοπικές `YYYY-MM-DD` strings (όπως τα γράφει το
 * `localDay`) — ποτέ UTC, αλλιώς σε UTC+3 τα μεσάνυχτα πέφτουν στην
 * προηγούμενη μέρα και οι εβδομάδες μετατοπίζονται.
 */

import { setVolume } from '../domain/volume';

export interface AnalyticsSetRow {
  exerciseId: string;
  workoutId: string;
  /** τοπική ημερομηνία της προπόνησης (YYYY-MM-DD) */
  date: string;
  weightKg: number | null;
  bodyweightKg: number | null;
  reps: number | null;
  restPauseReps?: number[];
  isWarmup?: boolean;
  setType?: string;
}

export interface WeeklyVolumePoint {
  /** Δευτέρα της εβδομάδας (YYYY-MM-DD) */
  weekStart: string;
  volume: number;
  sets: number;
}

export interface WeeklyFrequencyPoint {
  weekStart: string;
  sessions: number;
}

export interface CategorySlice {
  category: string;
  sets: number;
  volume: number;
}

export interface PRTimelineEvent {
  date: string;
  type: string;
  name: string;
}

export interface PRTimelinePoint {
  date: string;
  cumulative: number;
  events: PRTimelineEvent[];
}

/** Τοπικό ημερολόγιο — ίδια σύμβαση με `localDay` του queries.ts. */
export function formatLocalDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`;
}

export function parseLocalDay(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Δευτέρα της εβδομάδας που ανήκει η ημέρα. */
export function mondayOfDay(date: string): string {
  const d = parseLocalDay(date);
  const offset = (d.getDay() + 6) % 7; // 0 = Δευτέρα
  return formatLocalDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() - offset));
}

/**
 * Οι Δευτέρες των τελευταίων `weeks` εβδομάδων, αύξουσες, με τελευταία την
 * τρέχουσα (μερική) εβδομάδα. Οι κενές εβδομάδες ΔΕΝ παραλείπονται — αλλιώς
 * το chart συμπιέζει τον άξονα και δείχνει συνεχή προπόνηση.
 */
export function weekStarts(weeks: number, today: Date = new Date()): string[] {
  const count = Math.max(1, Math.floor(weeks));
  const currentMonday = mondayOfDay(formatLocalDay(today));
  const monday = parseLocalDay(currentMonday);
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(formatLocalDay(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - i * 7)));
  }
  return out;
}

/** Warm-up ανιχνεύεται και από τα δύο πεδία — μπορούν να αποκλίνουν σε imports. */
export function isWorkingSet(row: Pick<AnalyticsSetRow, 'isWarmup' | 'setType'>): boolean {
  return !row.isWarmup && row.setType !== 'warmup';
}

function rowVolume(row: AnalyticsSetRow): number {
  return setVolume({
    weight_kg: row.weightKg,
    bodyweight_kg: row.bodyweightKg,
    reps: row.reps,
    rest_pause_reps: row.restPauseReps,
  });
}

export function buildWeeklyVolume(
  rows: readonly AnalyticsSetRow[],
  weeks: number,
  today: Date = new Date(),
): WeeklyVolumePoint[] {
  const starts = weekStarts(weeks, today);
  const index = new Map(starts.map((weekStart, i) => [weekStart, i]));
  const points: WeeklyVolumePoint[] = starts.map((weekStart) => ({
    weekStart,
    volume: 0,
    sets: 0,
  }));

  for (const row of rows) {
    if (!isWorkingSet(row)) continue;
    const i = index.get(mondayOfDay(row.date));
    if (i == null) continue;
    const point = points[i]!;
    point.volume += rowVolume(row);
    point.sets += 1;
  }

  for (const point of points) point.volume = Math.round(point.volume);
  return points;
}

export function buildWeeklyFrequency(
  workouts: readonly { id: string; date: string }[],
  weeks: number,
  today: Date = new Date(),
): WeeklyFrequencyPoint[] {
  const starts = weekStarts(weeks, today);
  const index = new Map(starts.map((weekStart, i) => [weekStart, i]));
  const points: WeeklyFrequencyPoint[] = starts.map((weekStart) => ({
    weekStart,
    sessions: 0,
  }));
  const seen = new Set<string>();

  for (const workout of workouts) {
    if (seen.has(workout.id)) continue;
    seen.add(workout.id);
    const i = index.get(mondayOfDay(workout.date));
    if (i == null) continue;
    points[i]!.sessions += 1;
  }

  return points;
}

/**
 * Κατανομή working σετ ανά κατηγορία. Άγνωστη άσκηση (π.χ. διεγραμμένη) πέφτει
 * στο `other` αντί να εξαφανιστεί σιωπηλά από το σύνολο.
 */
export function buildCategoryDistribution(
  rows: readonly AnalyticsSetRow[],
  exercises: readonly { id: string; category: string }[],
): CategorySlice[] {
  const categoryById = new Map(exercises.map((e) => [e.id, e.category]));
  const acc = new Map<string, CategorySlice>();

  for (const row of rows) {
    if (!isWorkingSet(row)) continue;
    const category = categoryById.get(row.exerciseId) || 'other';
    const cur = acc.get(category) ?? { category, sets: 0, volume: 0 };
    cur.sets += 1;
    cur.volume += rowVolume(row);
    acc.set(category, cur);
  }

  return [...acc.values()]
    .map((slice) => ({ ...slice, volume: Math.round(slice.volume) }))
    .sort(
      (a, b) =>
        b.sets - a.sets || b.volume - a.volume || a.category.localeCompare(b.category),
    );
}

/**
 * Σωρευτικά PR ανά ημέρα. Τα events μιας ημέρας ομαδοποιούνται σε ΕΝΑ σημείο
 * (step chart), με σταθερή σειρά ώστε το tooltip/test να μη εξαρτάται από τη
 * σειρά της DB.
 */
export function buildPRTimeline(
  events: readonly PRTimelineEvent[],
  from?: string,
  to?: string,
): PRTimelinePoint[] {
  const byDate = new Map<string, PRTimelineEvent[]>();

  for (const event of events) {
    if (from != null && event.date < from) continue;
    if (to != null && event.date > to) continue;
    const list = byDate.get(event.date) ?? [];
    list.push(event);
    byDate.set(event.date, list);
  }

  let cumulative = 0;
  return [...byDate.keys()].sort().map((date) => {
    const dayEvents = byDate
      .get(date)!
      .slice()
      .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
    cumulative += dayEvents.length;
    return { date, cumulative, events: dayEvents };
  });
}
