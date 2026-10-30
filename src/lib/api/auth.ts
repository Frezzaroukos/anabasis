/**
 * Auth store — reactive πάνω από localStorage['anabasis.auth'] (client.ts).
 *
 * useSyncExternalStore με tiny subscribe/getSnapshot: ίδιο μοτίβο με τα
 * υπόλοιπα module-level stores του app (π.χ. src/lib/db/session.ts), απλά
 * reactive ώστε τα components να ξαναρενταρίζουν όταν αλλάζει η σύνδεση
 * (login/signup/logout/expired token) χωρίς manual reload.
 */

import { useSyncExternalStore } from 'react';
import {
  api,
  readStoredAuth,
  AUTH_CHANGED_EVENT,
  ApiError,
  setPendingOAuthToken,
  completeOAuthLogin,
  clearPendingOAuthToken,
  updateStoredAccount,
  type StoredAuth,
} from './client';
import { createProfile, deleteProfile, migrateProfileUserId } from '../db/queries';
import { getCurrentUserId, setCurrentUserId } from '../db/session';
import { fullResync, flushUnsynced } from '../sync';
import type { Account } from './types';

/**
 * Πετιέται όταν ένα logout/deleteAccount θα έσβηνε τοπικές αλλαγές που ΔΕΝ
 * πρόλαβαν να συγχρονιστούν (π.χ. offline). Το UI προειδοποιεί και προσφέρει
 * «logout ούτως ή άλλως» → ξανακαλεί με `{ force: true }`.
 */
export class UnsyncedChangesError extends Error {
  constructor(public readonly pending: number) {
    super(`${pending} unsynced change(s) would be lost`);
    this.name = 'UnsyncedChangesError';
  }
}

export type { StoredAuth, Account };
export { ApiError };

let state: StoredAuth | null = readStoredAuth();
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

if (typeof window !== 'undefined') {
  window.addEventListener(AUTH_CHANGED_EVENT, () => {
    state = readStoredAuth();
    emit();
  });
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): StoredAuth | null {
  return state;
}

/** Ποιος είναι συνδεδεμένος (ή null) — reactive, ασφαλές για SSR (server snapshot = client). */
export function useAuth(): StoredAuth | null {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function isLoggedIn(): boolean {
  return readStoredAuth() != null;
}

/**
 * Δένει το τρέχον τοπικό προφίλ στον λογαριασμό (migrateProfileUserId) και
 * ρίχνει πλήρες sync — server API-CONTRACT.md «Binding κατά το login/signup».
 */
async function bindLocalProfileAndResync(
  accountId: string,
  order: 'push-first' | 'pull-first',
): Promise<void> {
  const localId = getCurrentUserId();
  await migrateProfileUserId(localId, accountId);
  await fullResync(order);
}

/**
 * Repair a cached cloud session whose local profile binding was lost (e.g.
 * storage cleared while `anabasis.auth` survived). Only acts when the active
 * profile key is absent, so an explicitly chosen local profile is untouched.
 */
export async function repairMissingProfileBinding(): Promise<void> {
  const auth = readStoredAuth();
  if (!auth?.account) return;
  let stored: string | null = null;
  try {
    stored = globalThis.localStorage?.getItem('anabasis.activeProfile') ?? null;
  } catch {
    return;
  }
  if (stored) return;
  await bindLocalProfileAndResync(auth.account.id, 'pull-first');
}

export async function login(email: string, password: string): Promise<Account> {
  const res = await api.login(email, password);
  // pull-first: η συγχρονισμένη αλήθεια του λογαριασμού προηγείται των
  // default rows μιας φρέσκιας συσκευής (βλ. fullResync).
  await bindLocalProfileAndResync(res.account.id, 'pull-first');
  return res.account;
}

export async function signup(email: string, password: string): Promise<Account> {
  const res = await api.signup(email, password);
  await bindLocalProfileAndResync(res.account.id, 'push-first');
  return res.account;
}

/**
 * Shared-device protection: το logout είναι ΠΡΑΓΜΑΤΙΚΟ όριο ιδιωτικότητας —
 * μεταπηδάμε σε φρέσκο, άδειο προφίλ ΚΑΙ σβήνουμε τα τοπικά δεδομένα του
 * λογαριασμού που αποσυνδέεται.
 *
 * Χωρίς το σβήσιμο, σε κοινόχρηστη συσκευή τα δεδομένα του λογαριασμού που
 * έφυγε έμεναν φυσικά στο IndexedDB: ορατά μέσω του profile switcher, εξαγώγιμα
 * από το «export all profiles», και υλικό για σιωπηλό «δώρισμα» σε επόμενο
 * login (migrateProfileUserId πάνω στο τρέχον προφίλ). Το μόνο που κρατούσε
 * ήταν ότι δεν ήταν «ενεργό» — ανεπαρκές (Codex audit §2).
 *
 * Ασφαλές ως προς απώλεια: ένας cloud λογαριασμός κρατά την αλήθεια στον
 * server· το επόμενο login κατεβάζει ξανά τα πάντα (fullResync pull-first).
 * Δημιουργούμε ΠΡΩΤΑ το φρέσκο προφίλ και το κάνουμε ενεργό, μετά σβήνουμε το
 * παλιό — ώστε να μη μείνει ποτέ η συσκευή χωρίς έγκυρο ενεργό προφίλ. Το
 * reload είναι απαραίτητο ώστε τα liveQueries (που παρακολουθούν πίνακες, όχι
 * τη μεταβλητή session) να μη δείξουν στιγμιαία τα παλιά δεδομένα.
 */
export async function logout(opts: { force?: boolean } = {}): Promise<void> {
  const previous = getCurrentUserId();
  // Σπρώξε ό,τι εκκρεμεί ΠΡΙΝ χαθεί το token (api.logout) ή τα δεδομένα (purge).
  // Αν δεν προλάβει (offline) και ο χρήστης δεν έχει πει ρητά «ούτως ή άλλως»,
  // σταμάτα και άσε το UI να προειδοποιήσει — αλλιώς οι αλλαγές χάνονται σιωπηλά.
  const pending = await flushUnsynced();
  if (pending > 0 && !opts.force) throw new UnsyncedChangesError(pending);
  try {
    await api.logout();
  } catch {
    // client.ts καθάρισε ήδη το τοπικό token ό,τι κι αν έγινε το δίκτυο —
    // συνεχίζουμε το τοπικό logout ούτως ή άλλως.
  }
  const fresh = await createProfile('');
  setCurrentUserId(fresh.id);
  try {
    await deleteProfile(previous);
  } catch {
    // Αν το σβήσιμο αποτύχει, το ενεργό προφίλ είναι ήδη το φρέσκο/κενό —
    // δεν αφήνουμε τον χρήστη χωρίς session, κι ας μείνει (σπάνια) ορφανό data.
  }
  if (typeof window !== 'undefined') window.location.reload();
}

/**
 * Διαγραφή cloud λογαριασμού: ο server σβήνει την αλήθεια, άρα το τοπικό
 * αντίγραφο πρέπει οπωσδήποτε να φύγει κι αυτό (δεν υπάρχει πια πηγή για
 * επαναφορά). Ίδιο μοτίβο με το logout — φρέσκο προφίλ πρώτα, μετά σβήσιμο.
 */
export async function deleteAccount(confirmEmail: string): Promise<void> {
  const previous = getCurrentUserId();
  await api.deleteAccount(confirmEmail);
  const fresh = await createProfile('');
  setCurrentUserId(fresh.id);
  try {
    await deleteProfile(previous);
  } catch {
    // βλ. logout — το ενεργό προφίλ είναι ήδη φρέσκο· δεν μπλοκάρουμε τον χρήστη.
  }
  if (typeof window !== 'undefined') window.location.reload();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.changePassword(currentPassword, newPassword);
}

/** Passwordless account (Google/magic-link) adds its first password. */
export async function setPassword(newPassword: string): Promise<void> {
  await api.setPassword(newPassword);
}

/** Re-read `/api/me` and update the cached account (plan/role changes). */
export async function refreshAccount(): Promise<Account> {
  const me = await api.me();
  const account: Account = {
    id: me.id,
    email: me.email,
    role: me.role,
    created_at: me.created_at,
    auth_provider: me.auth_provider,
    password_set: me.password_set,
    plan: me.plan,
    plan_expires_at: me.plan_expires_at,
    plan_active: me.plan_active,
  };
  updateStoredAccount(account);
  return account;
}

/** Ακυρώνει όλες τις άλλες συσκευές· επιστρέφει πόσες sessions έκλεισαν. */
export async function logoutOtherDevices(): Promise<number> {
  const { revoked } = await api.logoutOthers();
  return revoked;
}

/** Ζητά magic-link στο email του χρήστη. Ο server επιστρέφει πάντα ok (no
 * enumeration)· το component δείχνει «τσέκαρε το email σου» ό,τι κι αν ισχύει. */
export async function requestMagicLink(email: string): Promise<void> {
  await api.magicRequest(email.trim());
}

/**
 * Εξαργυρώνει ένα magic-link token → session, με ΤΟ ΙΔΙΟ bind+resync flow με
 * το κανονικό login (pull-first). Το `api.magicConsume` έχει ήδη γράψει το
 * StoredAuth (isAuthCall + writeStoredAuth), οπότε εδώ μένει μόνο το binding.
 */
export async function magicLogin(token: string): Promise<Account> {
  const res = await api.magicConsume(token);
  await bindLocalProfileAndResync(res.account.id, 'pull-first');
  return res.account;
}

const MAGIC_FRAGMENT_RE = /(?:^#|&)magic=([^&]+)/;

/**
 * Boot-time (App.tsx, δίπλα στο initOAuthFragment): αν το URL fragment κουβαλά
 * `#magic=<token>` (το link του email), το εξαργυρώνει και καθαρίζει αμέσως το
 * token από τη γραμμή διεύθυνσης/ιστορικό. No-op χωρίς fragment. Fragment (όχι
 * query) ώστε το token να μη φτάνει ποτέ σε server/proxy access logs.
 */
export async function initMagicLink(): Promise<void> {
  if (typeof window === 'undefined') return;
  const match = MAGIC_FRAGMENT_RE.exec(window.location.hash);
  if (!match) return;

  const token = decodeURIComponent(match[1]!);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  try {
    await magicLogin(token);
  } catch (err) {
    console.error('[magic-link]', err);
  }
}

const OAUTH_FRAGMENT_RE = /(?:^#|&)oauth=([^&]+)/;

/**
 * Boot-time (App.tsx, δίπλα στο initAutoSync): αν το URL fragment κουβαλάει
 * `#oauth=<token>` (μετά το redirect από server oauth/google/callback), το
 * καθαρίζει ΑΜΕΣΩΣ από τη γραμμή διεύθυνσης/ιστορικό — ό,τι κι αν ακολουθήσει
 * — μετά ολοκληρώνει το login: /api/me για το account, StoredAuth, και το
 * ΙΔΙΟ bind+resync flow με login/signup. No-op χωρίς fragment.
 */
export async function initOAuthFragment(): Promise<void> {
  if (typeof window === 'undefined') return;
  const match = OAUTH_FRAGMENT_RE.exec(window.location.hash);
  if (!match) return;

  const token = decodeURIComponent(match[1]!);
  window.history.replaceState(null, '', window.location.pathname + window.location.search);

  setPendingOAuthToken(token);
  try {
    const me = await api.me();
    const account: Account = {
      id: me.id,
      email: me.email,
      role: me.role,
      created_at: me.created_at,
      auth_provider: me.auth_provider,
      password_set: me.password_set,
      plan: me.plan,
      plan_expires_at: me.plan_expires_at,
      plan_active: me.plan_active,
    };
    completeOAuthLogin(token, account);
    // pull-first — ίδια λογική με το κανονικό login (server API-CONTRACT.md).
    await bindLocalProfileAndResync(account.id, 'pull-first');
  } catch (err) {
    clearPendingOAuthToken();
    console.error('[oauth]', err);
  }
}
