import { getCurrentUserId } from '@/lib/db/session';
import { normalizeExerciseText, type ExerciseMemory } from './parseWorkoutNotes';

/**
 * Μνήμη αντιστοιχίσεων του Quick Paste: όταν ο χρήστης διορθώσει «Rows machine»
 * → «Front Lever Row», το θυμόμαστε για το επόμενο paste. localStorage ανά
 * προφίλ (χωρίς αλλαγή schema)· αποτυχία αποθήκευσης = σιωπηλά χωρίς μνήμη.
 */
const key = () => `anabasis.pasteMemory.${getCurrentUserId()}`;
const MAX_ENTRIES = 200;

export function loadPasteMemory(): ExerciseMemory {
  try {
    const raw = globalThis.localStorage?.getItem(key());
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: ExerciseMemory = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'string') out[k] = v;
    }
    return out;
  } catch {
    return {};
  }
}

/** Θυμάται rawName → exerciseId. Επιστρέφει true αν γράφτηκε. */
export function rememberPasteMatch(rawName: string, exerciseId: string): boolean {
  const norm = normalizeExerciseText(rawName);
  if (!norm || !exerciseId) return false;
  try {
    const mem = loadPasteMemory();
    delete mem[norm]; // ξανα-εισαγωγή = πιο πρόσφατο στο τέλος
    mem[norm] = exerciseId;
    const keys = Object.keys(mem);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete mem[k];
    globalThis.localStorage?.setItem(key(), JSON.stringify(mem));
    return true;
  } catch {
    return false;
  }
}

export function forgetPasteMatch(rawName: string): void {
  const norm = normalizeExerciseText(rawName);
  try {
    const mem = loadPasteMemory();
    if (!(norm in mem)) return;
    delete mem[norm];
    globalThis.localStorage?.setItem(key(), JSON.stringify(mem));
  } catch {
    /* ignore */
  }
}
