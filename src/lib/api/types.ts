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
  auth_provider: string | null;
  password_set: boolean;
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  plan_active: boolean;
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
  auth_provider: string | null;
  password_set: boolean;
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  plan_active: boolean;
}

export interface BillingConfig {
  enabled: boolean;
  price_label: string | null;
  days: number;
}

/** GET /api/auth/sessions — μία ενεργή συσκευή, χωρίς token/hash. */
export interface AuthSession {
  id: string;
  created_at: string;
  last_used_at: string | null;
  expires_at: string;
  user_agent: string | null;
  current: boolean;
}

/** Μία γραμμή sync — ελεύθερο JSON, ο server δεν καταλαβαίνει το schema. */
export interface SyncChange {
  tbl: string;
  rows: unknown[];
}

export interface SyncPushRequest {
  changes: SyncChange[];
  /** Ο pull cursor της συσκευής τη στιγμή του push. Ο server το συγκρίνει με το
   * gc_floor: αν είναι πίσω, απορρίπτει το push (reset_required) αντί να
   * αναστήσει edited ghost. Παραλείπεται σε cursor 0 (φρέσκια/fullResync). */
  cursor?: number;
}

export interface SyncPushResponse {
  cursor: number;
  /** Ο server ΑΠΕΡΡΙΨΕ το push: η συσκευή είναι πίσω από το gc_floor — τίποτα δεν
   * γράφτηκε. Ο client κάνει destructive reset και μετά ξαναστέλνει μόνο γνήσια
   * νεότερα. Προαιρετικό για συμβατότητα με παλιό server (undefined = false). */
  reset_required?: boolean;
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
  /** Η συσκευή είναι πίσω από το server gc_floor — πρέπει να κάνει destructive
   * resync (wipe + pull από 0) αντί να σπρώξει παλιά κατάσταση και να αναστήσει
   * σβησμένα rows. Προαιρετικό για συμβατότητα με παλιό server. */
  reset_required?: boolean;
}

export interface AdminUser {
  id: string;
  email: string;
  role: AccountRole;
  disabled: boolean;
  created_at: string;
  last_sync_at: string | null;
  row_count: number;
  /** Ενεργά (μη ληγμένα) sessions — πόσες συσκευές είναι συνδεδεμένες τώρα. */
  sessions: number;
  auth_provider: string | null;
  password_set: boolean;
  plan: 'free' | 'pro';
  plan_expires_at: string | null;
  plan_active: boolean;
}

export interface AdminStats {
  accounts: number;
  active_accounts: number;
  disabled_accounts: number;
  admins: number;
  pro_accounts: number;
  sessions: number;
  rows: number;
  /** `null` όταν ο server δεν μπορεί να διαβάσει το αρχείο — ΟΧΙ ψεύτικο 0. */
  db_size_bytes: number | null;
  uptime_seconds: number;
}

/** GET /api/admin/users/{id}/rows — sync_rows ενός λογαριασμού ανά πίνακα. */
export interface AdminTableBreakdown {
  tbl: string;
  row_count: number;
  deleted_count: number;
}

export interface HealthResponse {
  ok: true;
  version: string;
}

/** GET /api/auth/oauth/providers — ποια OAuth providers είναι configured σε
 * αυτόν τον server (config-gated· βλ. server/API-CONTRACT.md). */
export interface OAuthProviders {
  google: boolean;
  /** magic-link (email) login διαθέσιμο — δηλ. ο server έχει SMTP config. */
  magic: boolean;
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

/** Κατάσταση σχέσης όπως τη βλέπει ο τρέχων χρήστης. */
export type FriendshipState = 'self' | 'friend' | 'in' | 'out' | null;

/** Μία δημόσια πρόταση από το search (aggregate stats μόνο). */
export interface SocialSearchResult {
  username: string;
  display_name: string | null;
  level: number;
  xp: number;
  tier: string;
  altitude_m: number;
  streak_days: number;
  /** JSON array από earned badge ids */
  badges: string;
  friendship: FriendshipState;
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
  /** XP τελευταίων 7 ημερών (ο server το επιστρέφει πάντα· optional για mocks). */
  week_xp?: number;
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
  /** Μόνο στο logged-in endpoint· null στο δημόσιο/anonymous. */
  account_id?: string | null;
  friendship?: FriendshipState;
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
