import type { PersonalRecord } from '../db/types';
import { loadKey } from './pr';
import { realPRs } from './prBaseline';

/**
 * Η ροή «Πρόσφατα ρεκόρ» (αρχική + Ιστορικό). Μετά το backfill των νέων τύπων
 * τα ιστορικά PR πλημμύριζαν τη λίστα — εδώ μένουν ΜΟΝΟ:
 *  - πραγματικά ρεκόρ (όχι baseline, βλ. realPRs) των τελευταίων 30 ημερών,
 *  - ΕΝΑ ανά (άσκηση|δραστηριότητα, τύπο): το καλύτερο.
 * Όλα τα υπόλοιπα ζουν στην Πρόοδο (ανά άσκηση) — τίποτα δεν σβήνεται.
 */
export const RECENT_PR_DAYS = 30;

/** Τύποι όπου μικρότερη τιμή = καλύτερο (ρυθμός σε s/km). */
const LOWER_IS_BETTER: ReadonlySet<string> = new Set(['fastest_pace']);

type FeedRow = Pick<
  PersonalRecord,
  | 'exercise_id'
  | 'activity_kind'
  | 'type'
  | 'value'
  | 'weight_kg'
  | 'set_id'
  | 'workout_id'
  | 'achieved_at'
  | 'deleted_at'
>;

/** true όταν το `a` είναι καλύτερο ρεκόρ από το `b` (ίδια άσκηση+τύπος). */
function isBetter(a: FeedRow, b: FeedRow): boolean {
  if (a.type === 'reps_at_load') {
    // διαφορετικά φορτία: το βαρύτερο μετρά περισσότερο από τις reps στο ελαφρύ
    const la = loadKey(a.weight_kg);
    const lb = loadKey(b.weight_kg);
    if (la !== lb) return la > lb;
  }
  if (a.value !== b.value) {
    return LOWER_IS_BETTER.has(a.type) ? a.value < b.value : a.value > b.value;
  }
  return a.achieved_at > b.achieved_at; // ισοπαλία → το πιο πρόσφατο
}

export interface RecentPRFeedOptions {
  days?: number;
  limit?: number;
}

export function recentPRFeed<T extends FeedRow>(
  rows: ReadonlyArray<T>,
  now: Date,
  opts: RecentPRFeedOptions = {},
): T[] {
  const since = new Date(now.getTime() - (opts.days ?? RECENT_PR_DAYS) * 86_400_000).toISOString();
  // realPRs πάνω σε ΟΛΑ τα rows: το baseline κρίνεται από το πλήρες ιστορικό.
  const recent = realPRs(rows).filter((r) => r.achieved_at >= since);

  const best = new Map<string, T>();
  for (const r of recent) {
    const key = `${r.exercise_id ?? `act:${r.activity_kind ?? ''}`}|${r.type}`;
    const current = best.get(key);
    if (current == null || isBetter(r, current)) best.set(key, r);
  }

  // Το reps-ισοδύναμο είναι δεύτερη ματιά στο ίδιο σετ: όταν το σετ φαίνεται
  // ήδη με άλλο ρεκόρ (π.χ. max_reps), μη δείξεις το ίδιο επίτευγμα δύο φορές.
  const picked = [...best.values()];
  const setsShown = new Set(
    picked.filter((r) => r.type !== 'rep_equivalent' && r.set_id != null).map((r) => r.set_id),
  );
  const out = picked
    .filter((r) => r.type !== 'rep_equivalent' || r.set_id == null || !setsShown.has(r.set_id))
    .sort((a, b) => b.achieved_at.localeCompare(a.achieved_at));
  return opts.limit != null ? out.slice(0, opts.limit) : out;
}
