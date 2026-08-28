import type { Activity, ActivityKind, ExerciseCategory, SetType, WeightUnit } from '@/lib/db/types';
import { formatWeight } from '@/lib/units';

export const CATEGORY_DOT: Record<ExerciseCategory, string> = {
  push: 'bg-category-push',
  pull: 'bg-category-pull',
  legs: 'bg-category-legs',
  core: 'bg-category-core',
  other: 'bg-category-mixed',
};

export function formatLoad(
  weightKg: number | null,
  bodyweightKg: number | null,
  unit: WeightUnit = 'kg',
): string {
  if (weightKg != null && bodyweightKg != null) {
    return `BW+${formatWeight(weightKg, unit, { withUnit: false })}${unit}`;
  }
  if (weightKg != null) return formatWeight(weightKg, unit, { withUnit: false }) + unit;
  return 'BW';
}

/**
 * Fallback μόνο για όσο δεν έχει φορτώσει ακόμα (ή λείπει) η εγγραφή
 * Activity — π.χ. πρώτο render πριν απαντήσει το liveQuery. Η πηγή αλήθειας
 * είναι πλέον `activity.uses_sets`/`activity.tracks_distance` στη βάση.
 */
export const SET_LOGGED_ACTIVITY_KINDS: ActivityKind[] = ['strength', 'skill'];
export const DISTANCE_ACTIVITY_KINDS: ActivityKind[] = ['run', 'cycling', 'swim'];

/** true = logger με σετ/επαναλήψεις· false = χρόνος (+ απόσταση). Data-driven. */
export function isSetLoggedActivity(
  activity: Activity | undefined,
  kind: ActivityKind,
): boolean {
  if (activity) return activity.uses_sets;
  return SET_LOGGED_ACTIVITY_KINDS.includes(kind);
}

/** true = έχει νόημα η απόσταση (και άρα ο ρυθμός) γι' αυτή τη δραστηριότητα. */
export function isDistanceTrackedActivity(
  activity: Activity | undefined,
  kind: ActivityKind,
): boolean {
  if (activity) return activity.tracks_distance;
  return DISTANCE_ACTIVITY_KINDS.includes(kind);
}

/** Τιμές φόρμας ενός σετ — βάρος/επαναλήψεις + προαιρετική ένταση (RPE/RIR/tempo). */
export interface SetFormValues {
  weightKg: number | null;
  reps: number | null;
  rpe: number | null;
  rir: number | null;
  tempo: string | null;
}

/** Τύποι σετ που ενώνονται σε αλυσίδα μέσω κοινού group_id. */
export const CHAIN_SET_TYPES: SetType[] = ['dropset', 'superset', 'rest_pause'];

export type ChainType = 'dropset' | 'superset' | 'rest_pause';

export function isChainSetType(t: SetType): t is ChainType {
  return (CHAIN_SET_TYPES as SetType[]).includes(t);
}

/** Ενεργή αλυσίδα σετ (dropset/superset/rest_pause) στο τρέχον workout. */
export interface SetChain {
  id: string;
  type: ChainType;
}

export interface ResolvedSetGroup {
  groupId: string | null;
  chain: SetChain | null;
}

/**
 * Αποφασίζει το group_id ενός νέου σετ δεδομένου του τύπου του και της
 * τρέχουσας ενεργής αλυσίδας. Ίδιος τύπος chain όσο είναι ήδη ενεργή →
 * ξαναχρησιμοποιεί το group_id (συνέχεια της αλυσίδας). Διαφορετικός
 * chain-τύπος (ή καμία ενεργή αλυσίδα) → ανοίγει καινούρια με το `newId`
 * που παράγεται απ' έξω (crypto.randomUUID), ώστε η συνάρτηση να μένει pure.
 * Μη-chain τύποι (normal/warmup/amrap/failure) δεν αγγίζουν την αλυσίδα.
 */
export function resolveSetGroup(
  setType: SetType,
  activeChain: SetChain | null,
  newId: string,
): ResolvedSetGroup {
  if (!isChainSetType(setType)) {
    return { groupId: null, chain: activeChain };
  }
  if (activeChain && activeChain.type === setType) {
    return { groupId: activeChain.id, chain: activeChain };
  }
  const chain: SetChain = { id: newId, type: setType };
  return { groupId: chain.id, chain };
}

const CHAIN_COLOR_CLASSES = [
  'border-l-4 border-amber-500',
  'border-l-4 border-sky-500',
  'border-l-4 border-fuchsia-500',
  'border-l-4 border-emerald-500',
  'border-l-4 border-rose-500',
];

/** Σταθερό χρώμα ανά group_id (hash) — ίδια αλυσίδα = ίδιο χρώμα σε όλες τις κάρτες. */
export function groupColorClass(groupId: string): string {
  let hash = 0;
  for (let i = 0; i < groupId.length; i++) {
    hash = (hash * 31 + groupId.charCodeAt(i)) >>> 0;
  }
  return CHAIN_COLOR_CLASSES[hash % CHAIN_COLOR_CLASSES.length]!;
}

/** Ρυθμός σε min:ss/km. null αν δεν υπάρχει έγκυρη απόσταση ή χρόνος. */
export function formatPaceMinPerKm(elapsedSeconds: number, km: number): string | null {
  if (!(km > 0) || !(elapsedSeconds > 0)) return null;
  const secPerKm = elapsedSeconds / km;
  let m = Math.floor(secPerKm / 60);
  let s = Math.round(secPerKm % 60);
  if (s === 60) {
    s = 0;
    m += 1;
  }
  return `${m}:${String(s).padStart(2, '0')}/km`;
}
