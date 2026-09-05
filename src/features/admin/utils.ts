import type { AdminUser } from '@/lib/api/types';

/**
 * Μορφοποίηση για τον πίνακα στατιστικών του Admin — server/API-CONTRACT.md
 * GET /api/admin/stats στέλνει raw bytes/seconds, δεν έχουν νόημα ακατέργαστα.
 */

const BYTE_UNITS = ['KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < BYTE_UNITS.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${BYTE_UNITS[i]}`;
}

/** «2d 4h» / «3h 15m» / «42m» / «30s» — το μεγαλύτερο ζεύγος μονάδων που έχει νόημα. */
export function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${Math.floor(seconds)}s`;
}

export type AdminFilter = 'all' | 'active' | 'disabled' | 'admins';

/**
 * Αναζήτηση + φίλτρο κατάστασης, ως καθαρή συνάρτηση ώστε να δοκιμάζεται χωρίς
 * να στηθεί ολόκληρη η σελίδα. Το ταίριασμα είναι case-insensitive substring
 * στο email: ο admin ξέρει «κάτι με gmail», όχι το ακριβές string.
 */
export function filterUsers(
  users: AdminUser[],
  query: string,
  filter: AdminFilter,
): AdminUser[] {
  const needle = query.trim().toLowerCase();
  return users.filter((u) => {
    if (needle && !u.email.toLowerCase().includes(needle)) return false;
    if (filter === 'active') return !u.disabled;
    if (filter === 'disabled') return u.disabled;
    if (filter === 'admins') return u.role === 'admin';
    return true;
  });
}
