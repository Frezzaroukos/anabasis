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
  epoch: string;
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

/** GET /api/auth/oauth/providers — ποια OAuth providers είναι configured σε
 * αυτόν τον server (config-gated· βλ. server/API-CONTRACT.md). */
export interface OAuthProviders {
  google: boolean;
}

// ── Social (φιλίες, aggregate προφίλ, leaderboard) — server/src/social.rs ──────

/** GET /api/social/me — η δική μου δημόσια ταυτότητα + μετρητές. */
export interface SocialMe {
  username: string | null;
  display_name: string | null;
  share_profile: boolean;
  friends_count: number;
  incoming_count: number;
  outgoing_count: number;
  has_stats: boolean;
}

/** Ένας φίλος ή εκκρεμές αίτημα (aggregate stats μόνο). */
export interface FriendRow {
  account_id: string;
  username: string | null;
  display_name: string | null;
  status: 'accepted' | 'pending';
  /** 'friend' | 'in' (εισερχόμενο) | 'out' (εξερχόμενο) */
  direction: 'friend' | 'in' | 'out';
  level: number;
  xp: number;
  tier: string;
  altitude_m: number;
  streak_days: number;
  /** JSON array από earned badge ids */
  badges: string;
}

/** Μία σειρά στον πίνακα κατάταξης — aggregate, με SQL-enforced privacy. */
export interface LeaderboardRow {
  username: string | null;
  display_name: string | null;
  level: number;
  xp: number;
  tier: string;
  altitude_m: number;
  streak_days: number;
  /** JSON array από earned badge ids */
  badges: string;
  is_self: boolean;
}

/** GET /api/social/user/{username} — δημόσια προβολή προφίλ. */
export interface PublicProfile {
  username: string | null;
  display_name: string | null;
  level: number;
  xp: number;
  tier: string;
  altitude_m: number;
  /** JSON array από earned badge ids */
  badges: string;
  streak_days: number;
  longest_streak_days: number;
}

/** Το snapshot που δημοσιεύει ο client (server ξαναϋπολογίζει level/tier). */
export interface PublishStatsBody {
  xp: number;
  streak_days: number;
  longest_streak_days: number;
  badges: string[];
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
