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
  type StoredAuth,
} from './client';
import { migrateProfileUserId } from '../db/queries';
import { getCurrentUserId } from '../db/session';
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

export async function logout(): Promise<void> {
  await api.logout();
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.changePassword(currentPassword, newPassword);
}
