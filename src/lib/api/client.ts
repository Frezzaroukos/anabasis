/**
 * Anabasis API client — thin fetch wrapper πάνω στο server/API-CONTRACT.md.
 *
 * Base URL: VITE_API_BASE αν οριστεί (CI/deploy override)· αλλιώς '/api' στο
 * web app (same-origin πίσω από το Cloudflare tunnel) ή localhost:8121/api
 * μέσα στο Tauri desktop app (μιλάει κατευθείαν στον τοπικό server, όχι μέσω
 * webview origin).
 *
 * Το localStorage['anabasis.auth'] είναι η ΜΟΝΗ πηγή αλήθειας για το token —
 * ζει εδώ (όχι στο auth store) ώστε το fetch wrapper να μπορεί να διαβάσει/
 * καθαρίσει το token χωρίς κυκλικό import προς src/lib/api/auth.ts.
 */

import type {
  Account,
  AuthResponse,
  Me,
  SyncPullRequest,
  SyncPullResponse,
  SyncPushRequest,
  SyncPushResponse,
  AdminUser,
  AdminStats,
  AdminTableBreakdown,
  HealthResponse,
  OAuthProviders,
  SocialMe,
  FriendRow,
  LeaderboardRow,
  PublicProfile,
  PublishStatsBody,
} from './types';

export * from './types';

const AUTH_STORAGE_KEY = 'anabasis.auth';

/** (CustomEvent<StoredAuth | null>) — login/signup/logout/expired-token. Το
 * auth store (src/lib/api/auth.ts) ακούει εδώ αντί να ξέρει για fetch/storage. */
export const AUTH_CHANGED_EVENT = 'anabasis:auth-changed';

export interface StoredAuth {
  token: string;
  account: Account;
}

function safeLocalStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null; // private mode / storage disabled
  }
}

export function readStoredAuth(): StoredAuth | null {
  try {
    const raw = safeLocalStorage()?.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredAuth) : null;
  } catch {
    return null;
  }
}

function writeStoredAuth(auth: StoredAuth | null): void {
  try {
    if (auth) safeLocalStorage()?.setItem(AUTH_STORAGE_KEY, JSON.stringify(auth));
    else safeLocalStorage()?.removeItem(AUTH_STORAGE_KEY);
  } catch {
    /* private mode — η session απλά δεν επιζεί reload */
  }
  globalThis.dispatchEvent?.(new CustomEvent(AUTH_CHANGED_EVENT, { detail: auth }));
}

/**
 * OAuth-fragment flow (src/lib/api/auth.ts initOAuthFragment) μόνο: γράφει το
 * token ΧΩΡΙΣ account και ΧΩΡΙΣ AUTH_CHANGED_EVENT — απλά ώστε το επόμενο
 * request() να στείλει το Authorization header για το /api/me fetch που θα
 * συμπληρώσει το account. `account: null` περνάει τον runtime-only έλεγχο του
 * request() (διαβάζει μόνο `stored?.token`)· το πλήρες StoredAuth γράφεται
 * στο completeOAuthLogin παρακάτω.
 */
export function setPendingOAuthToken(token: string): void {
  try {
    safeLocalStorage()?.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({ token, account: null }),
    );
  } catch {
    /* private mode */
  }
}

/** Ολοκληρώνει το OAuth-fragment flow: πλήρες StoredAuth + κανονικό
 * AUTH_CHANGED_EVENT — ίδιο exit point με login/signup. */
export function completeOAuthLogin(token: string, account: Account): void {
  writeStoredAuth({ token, account });
}

/** Καθαρίζει ένα ημιτελές OAuth token (π.χ. το /api/me μετά το redirect απέτυχε). */
export function clearPendingOAuthToken(): void {
  writeStoredAuth(null);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function resolveBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_BASE as string | undefined;
  if (fromEnv) return fromEnv;
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  return isTauri ? 'http://localhost:8121/api' : '/api';
}

/** Πλήρες URL για "Sign in with Google" — browser navigation
 * (`window.location.href = googleStart()`), ΟΧΙ fetch (302 redirect). */
export function googleStart(): string {
  return `${resolveBaseUrl()}/auth/oauth/google/start`;
}

interface RequestOptions {
  method?: 'GET' | 'POST';
  body?: unknown;
  /** login/signup: ΜΗΝ καθαρίσεις αποθηκευμένη σύνδεση σε 401 — δεν υπάρχει
   * ήδη κάποια να ακυρωθεί, το 401 εδώ σημαίνει απλώς "λάθος κωδικός". */
  isAuthCall?: boolean;
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const stored = readStoredAuth();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (stored?.token) headers.Authorization = `Bearer ${stored.token}`;

  // Δίκτυο εκτός (fetch reject) φεύγει ΩΣ ΕΧΕΙ — ο caller (sync engine) το
  // ξεχωρίζει από ApiError για σιωπηλό offline handling.
  const res = await fetch(`${resolveBaseUrl()}${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    let code = 'unknown_error';
    let message = res.statusText;
    try {
      const errBody = (await res.json()) as { error?: string; message?: string };
      if (errBody.error) code = errBody.error;
      if (errBody.message) message = errBody.message;
    } catch {
      /* κενό/μη-JSON σώμα σφάλματος */
    }
    // 401 = καθάρισε το session — ΕΚΤΟΣ αν είναι λάθος τρέχων κωδικός
    // (change_password επιστρέφει 401/bad_credentials· δεν πρέπει να σε βγάζει
    // έξω) ή αν είναι το ίδιο το login/signup (isAuthCall).
    if (res.status === 401 && !opts.isAuthCall && code !== 'bad_credentials') {
      writeStoredAuth(null);
    }
    throw new ApiError(res.status, code, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  async signup(email: string, password: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: { email, password },
      isAuthCall: true,
    });
    writeStoredAuth(res);
    return res;
  },

  async login(email: string, password: string): Promise<AuthResponse> {
    const res = await request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: { email, password },
      isAuthCall: true,
    });
    writeStoredAuth(res);
    return res;
  },

  async logout(): Promise<void> {
    try {
      await request('/auth/logout', { method: 'POST' });
    } finally {
      // τοπικό logout πάντα, ακόμα κι αν το δίκτυο/session-revoke απέτυχε
      writeStoredAuth(null);
    }
  },

  me(): Promise<Me> {
    return request<Me>('/me');
  },

  changePassword(currentPassword: string, newPassword: string): Promise<void> {
    return request('/auth/change_password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword },
    });
  },

  async claimAdmin(code: string): Promise<void> {
    await request('/auth/claim_admin', { method: 'POST', body: { code } });
    // Ο ρόλος άλλαξε server-side — ενημέρωσε το cached account ώστε το UI
    // (badge, admin link) να αντιδράσει χωρίς logout/login.
    const auth = readStoredAuth();
    if (auth) writeStoredAuth({ ...auth, account: { ...auth.account, role: 'admin' } });
  },

  syncPush(body: SyncPushRequest): Promise<SyncPushResponse> {
    return request<SyncPushResponse>('/sync/push', { method: 'POST', body });
  },

  syncPull(body: SyncPullRequest): Promise<SyncPullResponse> {
    return request<SyncPullResponse>('/sync/pull', { method: 'POST', body });
  },

  adminListUsers(): Promise<AdminUser[]> {
    return request<AdminUser[]>('/admin/users');
  },

  adminSetDisabled(id: string, disabled: boolean): Promise<void> {
    return request(`/admin/users/${id}/disable`, { method: 'POST', body: { disabled } });
  },

  adminResetPassword(id: string): Promise<{ temp_password: string }> {
    return request(`/admin/users/${id}/reset_password`, { method: 'POST', body: {} });
  },

  /** Ανάλυση των sync_rows ενός λογαριασμού ανά πίνακα — lazy, μόνο όταν ο
   * admin ανοίξει τη λεπτομέρεια του χρήστη. */
  adminUserRows(id: string): Promise<AdminTableBreakdown[]> {
    return request<AdminTableBreakdown[]>(`/admin/users/${id}/rows`);
  },

  adminStats(): Promise<AdminStats> {
    return request<AdminStats>('/admin/stats');
  },

  health(): Promise<HealthResponse> {
    return request<HealthResponse>('/health');
  },

  oauthProviders(): Promise<OAuthProviders> {
    return request<OAuthProviders>('/auth/oauth/providers');
  },

  // ── Social ──────────────────────────────────────────────────────────────────
  socialMe(): Promise<SocialMe> {
    return request<SocialMe>('/social/me');
  },

  socialUpdateProfile(body: {
    username?: string;
    display_name?: string;
    share_profile?: boolean;
  }): Promise<SocialMe> {
    return request<SocialMe>('/social/profile', { method: 'POST', body });
  },

  socialPublishStats(body: PublishStatsBody): Promise<unknown> {
    return request('/social/stats', { method: 'POST', body });
  },

  socialFriends(): Promise<FriendRow[]> {
    return request<FriendRow[]>('/social/friends');
  },

  socialRequests(): Promise<FriendRow[]> {
    return request<FriendRow[]>('/social/requests');
  },

  socialSendRequest(username: string): Promise<{ status: string }> {
    return request('/social/requests', { method: 'POST', body: { username } });
  },

  socialAccept(id: string): Promise<void> {
    return request(`/social/requests/${id}/accept`, { method: 'POST', body: {} });
  },

  socialRemove(id: string): Promise<void> {
    return request(`/social/friends/${id}/remove`, { method: 'POST', body: {} });
  },

  socialLeaderboard(scope: 'friends' | 'global'): Promise<LeaderboardRow[]> {
    return request<LeaderboardRow[]>(`/social/leaderboard?scope=${scope}`);
  },

  socialPublicProfile(username: string): Promise<PublicProfile> {
    return request<PublicProfile>(`/social/user/${encodeURIComponent(username)}`);
  },
};
