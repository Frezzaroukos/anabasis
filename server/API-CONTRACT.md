# Anabasis API — Συμβόλαιο v1

Self-hosted Rust/Axum service. Base path: `/api` (πίσω από το Cloudflare tunnel
στο ίδιο origin με το web app: `https://anabasis.axonos.dev/api`· τοπικά `http://localhost:8121/api`).
Πηγές αποφάσεων: research 2026-08-28 — bearer tokens όχι cookies (Tauri prod
cookie trap), όχι JWT (θέλουμε instant revocation), sync = row-level LWW με
server-assigned `sync_seq` (όχι εμπιστοσύνη σε client clocks).

## Γενικά

- Auth: `Authorization: Bearer <token>` — opaque 256-bit random token (base64url).
  Στη βάση αποθηκεύεται ΜΟΝΟ το SHA-256 hash του.
- Όλα τα σώματα JSON. Σφάλματα: `{ "error": "<code>", "message": "<ανθρώπινο>" }`
  με σωστό HTTP status (400/401/403/409/423/429/500).
- Timestamps: ISO-8601 UTC strings (όπως ήδη στο IndexedDB schema).
- CORS allowlist: `https://anabasis.axonos.dev`, `tauri://localhost`,
  `http://tauri.localhost`, `http://localhost:5173`, `http://localhost:8120`.
  Allowed headers: `authorization, content-type`. Χωρίς credentials mode.

## SQLite schema (server)

```sql
accounts(
  id TEXT PK,                -- uuid v4· γίνεται και το user_id των τοπικών rows
  email TEXT UNIQUE NOT NULL,-- lowercase-normalized
  password_hash TEXT NOT NULL,   -- argon2id PHC string
  role TEXT NOT NULL DEFAULT 'user',  -- 'user' | 'admin'
  disabled INTEGER NOT NULL DEFAULT 0,
  failed_logins INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,         -- exponential lockout
  last_seq INTEGER NOT NULL DEFAULT 0,  -- per-account sync counter
  created_at TEXT NOT NULL,
  last_sync_at TEXT
)
sessions(
  token_hash TEXT PK,        -- sha256(token), hex
  account_id TEXT NOT NULL REFERENCES accounts(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,  -- 90 μέρες· sliding: ανανεώνεται σε χρήση
  last_used_at TEXT,
  user_agent TEXT
)
sync_rows(
  account_id TEXT NOT NULL,
  tbl TEXT NOT NULL,         -- όνομα πίνακα του client (π.χ. 'workouts')
  row_id TEXT NOT NULL,      -- το uuid PK του row
  payload TEXT NOT NULL,     -- ολόκληρο το row ως JSON (όπως το στέλνει ο client)
  seq INTEGER NOT NULL,      -- per-account μονότονος αύξων — Ο cursor του sync
  deleted INTEGER NOT NULL DEFAULT 0,  -- καθρέφτης του payload.deleted_at != null
  server_updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, tbl, row_id)
)
CREATE INDEX idx_sync_rows_seq ON sync_rows(account_id, seq);
```

Ο server ΔΕΝ καταλαβαίνει τα σχήματα των rows — γενικό replicated row store.
Μελλοντικές αλλαγές στο client schema δεν χρειάζονται server migration.
Επιτρεπτά `tbl`: τα 15 backup tables του client (allowlist — reject άγνωστα):
users, exercises, workouts, sets, personal_records, skills, skill_steps,
user_skill_progress, user_skill_step_completions, app_settings, body_metrics,
programs, program_exercises, activities, goals.

## Endpoints

### POST /api/auth/signup
Body: `{ email, password }`. Password ≥ 8 chars. Αν το email == env
`ANABASIS_ADMIN_EMAIL` → role 'admin'. Απάντηση 200:
`{ token, account: { id, email, role, created_at } }` (auto-login).
409 `email_taken`. 429 από rate limiter.

### POST /api/auth/login
Body: `{ email, password }`. 200 ίδιο σχήμα με signup.
401 `bad_credentials` (ίδιο μήνυμα για άγνωστο email/λάθος pass — no user enumeration).
423 `locked` όταν locked_until στο μέλλον (exponential: 2^n λεπτά μετά τα 5 failures).
403 `disabled`.

### POST /api/auth/logout  (auth)
Σβήνει το session row. 200 `{}`.

### GET /api/me  (auth)
200 `{ id, email, role, created_at, last_sync_at }`.

### POST /api/auth/change_password  (auth)
Body: `{ current_password, new_password }`. Ακυρώνει όλα τα ΑΛΛΑ sessions.

### POST /api/sync/push  (auth)
Body: `{ changes: [ { tbl, rows: [ <row JSON> ] } ] }`
Κάθε row ΠΡΕΠΕΙ να έχει `id` (uuid) και `user_id` == account id (ο server
το επιβάλλει — 400 `wrong_user` αλλιώς). Σε ΜΙΑ transaction: για κάθε row
bump `accounts.last_seq`, upsert στο sync_rows με νέο seq (last-push-wins),
`deleted` από το `payload.deleted_at`. Όριο: 5000 rows/request (413).
200: `{ cursor: <νέο max seq> }`.

### POST /api/sync/pull  (auth)
Body: `{ cursor: <i64, 0 για φρέσκια συσκευή>, limit?: <=2000 default 1000 }`
200: `{ changes: [ { tbl, rows: [...] } ], cursor: <max seq returned>, has_more: bool }`
Rows με `seq > cursor` ORDER BY seq, LIMIT· μέσα σε μία read transaction.
Tombstones (deleted=1) επιστρέφονται κανονικά — ο client κάνει bulkPut το
payload (που ήδη κουβαλά deleted_at).

### Admin (auth + role=admin, αλλιώς 403)
- GET  /api/admin/users → `[ { id, email, role, disabled, created_at, last_sync_at, row_count } ]`
- POST /api/admin/users/:id/disable  body `{ disabled: bool }` — disable σκοτώνει και τα sessions του.
  400 `self_disable` (δεν απενεργοποιείς τον εαυτό σου) / `last_admin` (δεν αδειάζει ποτέ η λίστα admins) — μόνο στο `disabled: true`.
- POST /api/admin/users/:id/reset_password body `{}` → 200 `{ temp_password }` (τυχαίο, ο χρήστης το αλλάζει μετά)
- GET  /api/admin/stats → `{ accounts, rows, db_size_bytes, uptime_seconds }`

### GET /api/health
200 `{ ok: true, version }` — χωρίς auth, για monitoring.

## Rate limiting

tower_governor keyed από `CF-Connecting-IP` (fallback peer IP):
auth endpoints 10 req/min/IP· sync 120 req/min/IP. Συν το persistent
failed-login lockout στο accounts (πιο πάνω).

## Client-side συμβόλαιο (frontend)

- Token σε `localStorage['anabasis.auth']` = `{ token, account }` — app-level,
  όχι ανά προφίλ.
- **Binding κατά το login/signup**: το τρέχον τοπικό profile γίνεται ο
  λογαριασμός — `migrateProfileUserId(localUserId, account.id)` (transaction
  και στους 15 πίνακες + users.id + session pointer), εκτός αν ήδη ==.
  Μετά: full push (όλα τα rows του user_id), μετά pull από cursor 0.
- Sync cursors σε `localStorage['anabasis.sync']` = `{ pullCursor, lastPushAt, lastSyncAt }`.
- Push επιλογή: rows με `updated_at > lastPushAt - 5min` (client clock ΜΟΝΟ
  τοπικά — idempotent upserts, τα διπλοστάλματα είναι ακίνδυνα).
- Auto-sync: στο boot, κάθε 5 λεπτά, και 15s debounce μετά από γράψιμο·
  σιωπηλά offline-tolerant (καμία ειδοποίηση σε αποτυχία δικτύου, μόνο ένδειξη
  "τελευταίο sync" στις Ρυθμίσεις).

## Deployment

- Binary: `server/target/release/anabasis-api`, port 8121 (env `ANABASIS_API_PORT`).
- DB: `~/.local/share/anabasis-server/anabasis.db` (env `ANABASIS_DB_PATH`) — WAL mode.
- Env: `ANABASIS_ADMIN_EMAIL` (πρώτο signup με αυτό το email = admin).
- systemd user unit `anabasis-api.service` + Cloudflare tunnel ingress:
  `anabasis.axonos.dev` path `/api/*` → `http://localhost:8121` ΠΡΙΝ το
  υπάρχον rule του :8120.
