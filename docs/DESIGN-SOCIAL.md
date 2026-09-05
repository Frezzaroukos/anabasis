# Friends + Ranking + «Your Ascent» — buildable spec

> Από design workflow (wf_6d38cbdd, 3 agents + synthesis, read-only). Το πιο
> δύσκολο §7 feature. **ΔΙΑΒΑΣΕ ΤΟ πριν το χτίσεις** — έχει non-obvious constraints
> που αν αγνοηθούν σπάνε το sync/privacy. Build order: **Share/QR (✅ έγινε) →
> Settings reorg → ΑΥΤΟ (last, L effort).**

## Η κρίσιμη αρχιτεκτονική απόφαση
Ένα friendship συνδέει **ΔΥΟ account_ids**. Ο server `sync.rs` ΑΠΟΡΡΙΠΤΕΙ κάθε row
με `user_id != auth.account_id` («wrong_user», sync.rs:84). Άρα το social graph
**ΔΕΝ μπορεί ΠΟΤΕ** να περάσει από το per-account LWW `sync_rows` mirror.

➡️ **Social = dedicated `/api/social` endpoints** (νέο `server/src/social.rs`,
patterned στο `admin.rs`, πίσω από AuthUser extractor + sync_governor rate-limit).
**ΟΧΙ** entries στο `ALLOWED_TABLES`. Αυτή η εξαίρεση ΕΙΝΑΙ η εγγύηση ασφάλειας.

## Gamification σήμερα (μη το ξαναγράψεις)
`src/lib/gamification.ts` (pure fns): `XP = workouts*100 + sets*5 + PRs*50 +
masteredSkillSteps*40`· `level = floor(sqrt(xp/100))+1`· 5 altitude tiers by
minLevel· 7 deterministic badges· inputs από `getGamificationInput()` (queries.ts).
**Δεν υπάρχει server XP.** Μένει client-computed· ο server κρατά ΜΟΝΟ opt-in
**aggregate snapshot** (level/xp/tier/altitude/badges/streaks/name) — ΠΟΤΕ raw
workouts/sets/PRs/body/goals.

## Schema (v15, additive)
1. **FIRST fix** `SCHEMA_VERSION` const alignment (τώρα 14 — κράτα το synced με το
   `this.version(N)`). [ΤΟ 13→14 ΕΓΙΝΕ ήδη· στο v15 βάλε 15.]
2. `this.version(15).stores({ friends_cache: 'account_id, status, updated_at',
   leaderboard_cache: 'scope' }).upgrade(tx → users.modify(u → { u.username ??=
   null; u.share_profile ??= false; }))`.
3. `friends_cache` + `leaderboard_cache` = **LOCAL-ONLY caches** — ΕΞΑΙΡΕΣΕ τα από
   `USER_DATA_TABLES` (queries.ts) & server `ALLOWED_TABLES` (ίδιο precedent με
   `events_outgoing`/`program_days`). Γεμίζουν από `/api/social` για offline reads.
4. Νέα user fields `username`/`share_profile` καβαλάνε το ήδη-allowed `users` sync
   blob (offline mirror). **Username duality:** `accounts.username` (server, UNIQUE
   partial index) = source of truth· `users.username` = mirror από το
   `/social/profile` response· handle 409 σε clash, μη τα αφήσεις να αποκλίνουν.
5. **New DB helpers → `src/lib/db/friends.ts`** (ΠΟΤΕ στο queries.ts — oxc threshold).

## Server (`social.rs`, migration `0004_social.sql`)
- Directed friendship edge (requester/addressee/status) + UNION reads.
- `profile_stats` (aggregate snapshot), published ΜΟΝΟ αν `share_profile OR ≥1
  accepted friend` (fully-private solo user γράφει τίποτα).
- Endpoints: friend request/accept/decline/unfriend· `GET /user/{username}`·
  leaderboard (friends scope + global). Wire στο `app.rs` κάτω από sync_governor.

## Privacy (SQL-enforced, ΟΧΙ client)
- Leaderboard + profile view: `WHERE share_profile=1` + accepted-friend check **στο
  SQL**. Expose ΜΟΝΟ: username/display_name/level/xp/tier/altitude_m/badges/
  streaks/rank. **ΠΟΤΕ:** email, raw workouts/sets/PRs, e1RM/loads, body metrics,
  exercise names, goal contents. Tests και για τα δύο scopes.
- **XP clamp** στο publish (level-formula range) — anti-inflation. Καμία real
  ανταμοιβή δεμένη σε rank (low stakes).
- Username enumeration: uniform not-found + rate-limit· validate charset/length +
  uniqueness (409).

## Cross-cutting risks (μη τα πατήσεις)
- Social writes ΠΟΤΕ στο sync_rows· offline → disable/queue gracefully, cache reads
  δουλεύουν.
- `rm -rf node_modules/.vite` πριν εμπιστευτείς vitest (oxc cache mask).
- ΜΗΝ half-wire share_links/referral/per-user slugs (program_days lesson — no
  backend to honor = fabricated state).
- Frontend: `src/lib/db/friends.ts` + pages + i18n· altitude/Your-Ascent UI
  evolution (levels/badges/streaks/leaderboard).

## Frontend build order (όταν έρθει η σειρά)
(a) schema v15 · (b) `0004_social.sql` · (c) `social.rs` profile/stats · (d) friend-
graph handlers · (e) leaderboard + `/user/{username}` με SQL privacy · (f) client
`friends.ts`/pages/i18n. Test+deploy ανά βήμα.
