import type { SetEntry } from '../db/types';

/**
 * Ένα «working set» = μετράει για όγκο/PR/στατιστικά.
 *
 * Ο κανόνας ήταν διάσπαρτος: άλλα σημεία έλεγχαν `!is_warmup`, άλλα
 * `set_type !== 'warmup'`, άλλα και τα δύο — οπότε ένα χειροκίνητο/παλιό σετ με
 * μόνο το ένα σημάδι μπορούσε να «γλιστρήσει» σε μια μέτρηση. Εδώ είναι ΕΝΑΣ
 * ορισμός: ζωντανό (όχι soft-deleted) ΚΑΙ όχι warm-up με κανένα από τα δύο
 * σημάδια. Τα σημεία που ΣΚΟΠΙΜΑ μετράνε και warm-ups (π.χ. το «πόσα σετ
 * έκανες» στο active workout) ΔΕΝ χρησιμοποιούν αυτόν τον helper.
 */
export function isWorkingSet(
  set: Pick<SetEntry, 'is_warmup' | 'set_type' | 'deleted_at'>,
): boolean {
  return set.deleted_at == null && !set.is_warmup && set.set_type !== 'warmup';
}

/** Το αντίστροφο: warm-up (με οποιοδήποτε σημάδι) ή soft-deleted. */
export function isWarmupOrDeleted(
  set: Pick<SetEntry, 'is_warmup' | 'set_type' | 'deleted_at'>,
): boolean {
  return !isWorkingSet(set);
}
