/**
 * Ποιο προφίλ είναι ενεργό αυτή τη στιγμή.
 *
 * Γιατί ξεχωριστό module και όχι στο bootstrap: το `user_id` το χρειάζονται
 * ΟΛΑ τα queries συγχρόνως (μέσα σε `.where('user_id').equals(...)`), οπότε
 * δεν μπορεί να είναι async lookup. Κρατάμε την τιμή σε module-level μεταβλητή
 * και τη μονιμοποιούμε στο localStorage — μία σύγχρονη ανάγνωση στο boot.
 *
 * ⚠️ Αυτό ΔΕΝ είναι authentication. Είναι «ποιανού τα δεδομένα βλέπω σε αυτή
 * τη συσκευή». Πραγματικό login απαιτεί server· βλ. σχέδιο cross-device sync.
 */

/** Το προφίλ που υπήρχε πριν μπουν πολλαπλά — μένει σταθερό για συμβατότητα. */
export const DEFAULT_USER_ID = 'local-user-00000-0000-4000-8000-000000000001';

const STORAGE_KEY = 'anabasis.activeProfile';

let currentUserId: string = DEFAULT_USER_ID;

/** Διαβάζεται μία φορά στο boot, πριν τρέξει οποιοδήποτε query. */
export function initSession(): void {
  try {
    const saved = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (saved) currentUserId = saved;
  } catch {
    /* private mode / storage disabled — μένουμε στο default */
  }
}

export function getCurrentUserId(): string {
  return currentUserId;
}

/**
 * Αλλαγή ενεργού προφίλ. Ο caller κάνει reload — τα liveQueries παρακολουθούν
 * πίνακες, όχι αυτή τη μεταβλητή, οπότε δεν θα ξαναδιάβαζαν μόνα τους.
 */
export function setCurrentUserId(id: string): void {
  currentUserId = id;
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, id);
  } catch {
    /* ό,τι δεν μονιμοποιηθεί, χάνεται στο επόμενο άνοιγμα — αποδεκτό */
  }
}

/** Μόνο για tests: επαναφορά σε καθαρή κατάσταση. */
export function resetSession(): void {
  currentUserId = DEFAULT_USER_ID;
  try {
    globalThis.localStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}
