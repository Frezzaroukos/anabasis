/**
 * Anabasis API — τύποι που καθρεφτίζουν server/API-CONTRACT.md.
 * Ο server ΔΕΝ υπάρχει ακόμα (χτίζεται παράλληλα) — αυτοί οι τύποι είναι το
 * ΜΟΝΟ σημείο αλήθειας μέχρι να είναι έτοιμος, οπότε mocks/tests δουλεύουν
 * πάνω σε αυτούς.
 */

export type AccountRole = 'user' | 'admin';

export interface Account {
  id: string;
  email: string;
  role: AccountRole;
  created_at: string;
}

export interface AuthResponse {
  token: string;
  account: Account;
}

export interface Me {
  id: string;
  email: string;
  role: AccountRole;
  created_at: string;
  last_sync_at: string | null;
}

/** Μία γραμμή sync — ελεύθερο JSON, ο server δεν καταλαβαίνει το schema. */
export interface SyncChange {
  tbl: string;
  rows: unknown[];
}

export interface SyncPushRequest {
  changes: SyncChange[];
}

export interface SyncPushResponse {
  cursor: number;
}

export interface SyncPullRequest {
  cursor: number;
  limit?: number;
}

export interface SyncPullResponse {
  changes: SyncChange[];
  cursor: number;
  has_more: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  role: AccountRole;
  disabled: boolean;
  created_at: string;
  last_sync_at: string | null;
  row_count: number;
}

export interface AdminStats {
  accounts: number;
  rows: number;
  db_size_bytes: number;
  uptime_seconds: number;
}

export interface HealthResponse {
  ok: true;
  version: string;
}

/** Server error codes ανά endpoint — βλ. server/API-CONTRACT.md. Ελεύθερο
 * string ώστε άγνωστοι/μελλοντικοί κωδικοί να μην σπάνε τύπους. */
export type ApiErrorCode =
  | 'email_taken'
  | 'bad_credentials'
  | 'locked'
  | 'disabled'
  | 'wrong_user'
  | (string & {});
