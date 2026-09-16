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
  type StoredAuth,
} from './client';
import { createProfile, migrateProfileUserId } from '../db/queries';
import { getCurrentUserId, setCurrentUserId } from '../db/session';
import { fullResync } from '../sync';
import type { Account } from './types';

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
 * Shared-device protection: μετά το logout, ΔΕΝ μένει «ενεργό» το τοπικό
 * προφίλ αυτού του λογαριασμού — μεταπηδάμε σε ένα φρέσκο, άδειο προφίλ.
 *
 * Χωρίς αυτό υπάρχουν δύο διαρροές σε κοινόχρηστη συσκευή: (α) τα δεδομένα
 * του λογαριασμού που μόλις αποσυνδέθηκε παραμένουν πλήρως ορατά (Dashboard/
 * Calendar/History...) σε όποιον χρησιμοποιήσει επόμενος τη συσκευή, και
 * (β) αν αυτός ο επόμενος συνδεθεί με ΔΙΚΟ ΤΟΥ, διαφορετικό λογαριασμό, το
 * bindLocalProfileAndResync/migrateProfileUserId δουλεύει πάνω στο *τρέχον*
 * τοπικό προφίλ της συσκευής (`getCurrentUserId()`) — θα «δώριζε» σιωπηλά
 * τα προσωπικά δεδομένα του πρώτου λογαριασμού μέσα στον δεύτερο, μόνιμα,
 * με το επόμενο push. Το reload είναι απαραίτητο ώστε τα liveQueries (που
 * παρακολουθούν πίνακες, όχι τη μεταβλητή session) να μη δείξουν στιγμιαία
 * τα παλιά δεδομένα.
 */
export async function logout(): Promise<void> {
  try {
    await api.logout();
  } catch {
    // client.ts καθάρισε ήδη το τοπικό token ό,τι κι αν έγινε το δίκτυο —
    // συνεχίζουμε το τοπικό logout ούτως ή άλλως.
  }
  const fresh = await createProfile('');
  setCurrentUserId(fresh.id);
  if (typeof window !== 'undefined') window.location.reload();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.changePassword(currentPassword, newPassword);
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
    const account: Account = { id: me.id, email: me.email, role: me.role, created_at: me.created_at };
    completeOAuthLogin(token, account);
    // pull-first — ίδια λογική με το κανονικό login (server API-CONTRACT.md).
    await bindLocalProfileAndResync(account.id, 'pull-first');
  } catch (err) {
    clearPendingOAuthToken();
    console.error('[oauth]', err);
  }
}
