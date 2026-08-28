# Anabasis — Database Schema

> **Πηγή αλήθειας:** αυτό το αρχείο περιγράφει `src/lib/db/schema.ts` +
> `src/lib/db/types.ts`, γεννημένο-από-κώδικα. Αν διαφωνούν, ο κώδικας κερδίζει —
> ενημέρωσε αυτό το αρχείο, όχι το αντίστροφο.
>
> **Σήμερα:** IndexedDB (Dexie 4) τοπικά, μοναδική πηγή δεδομένων στη συσκευή.
> Cloud sync **δεν έχει shippάρει ακόμα** — το πλάνο είναι **δικό μας Rust/Axum
> backend, self-hosted** (όχι Supabase — βλ. §"Server sync" παρακάτω), και είναι
> **σε εξέλιξη** ταυτόχρονα με αυτό το αρχείο. `SCHEMA_VERSION = 10` στο
> `schema.ts` κατά τη συγγραφή· το **v10** που τελικά μπήκε είναι backfill
> `app_settings.auto_start_rest_timer ??= true` (auto-start του rest timer).
> Το `sets.hold_seconds` είναι απλό μη-indexed πεδίο — ΔΕΝ πήρε version block
> (το Dexie δεν απαιτεί δήλωση μη-indexed πεδίων, δεν υπάρχει backfill).

---

## Design principles

1. **UUIDs παντού** — όχι auto-increment, sync-friendly εξ ορισμού
2. **Soft deletes** (`deleted_at: ISOTimestamp | null`) — ποτέ hard delete σε user-data table, για undo/sync
3. **`updated_at` σε κάθε πίνακα** — last-write-wins ανά εγγραφή, όχι ανά πίνακα
4. **Client-generated timestamps** — ώστε offline writes να έχουν σωστή σειρά
5. **`schema_version` στο `User`** — γράφεται από το `SCHEMA_VERSION` constant στο `schema.ts`, ενημερώνεται στο bootstrap/create-user

---

## Πίνακες (16)

Όλοι οι τύποι είναι από `src/lib/db/types.ts`. `UUID = string`, `ISOTimestamp = string` (ISO 8601).

### `users`
Μία εγγραφή τοπικά ανά προφίλ (πολλαπλά προφίλ/συσκευή από v6).

```typescript
{
  id: UUID
  email: string | null
  display_name: string | null
  units: 'metric' | 'imperial'
  bodyweight_unit: 'kg' | 'lb'
  language: 'en' | 'el'
  schema_version: number
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
  is_pro: boolean
  pro_expires_at: ISOTimestamp | null
}
```
**Index:** `id, email, updated_at`

### `exercises`
Βιβλιοθήκη ασκήσεων. Pre-seeded (`user_id: null`) + user-created.

```typescript
{
  id: UUID
  user_id: UUID | null              // null = system-seeded
  name: string
  category: ExerciseCategory        // 'push'|'pull'|'legs'|'core'|'other' ή δικό σου string
  movement_type: 'compound' | 'isolation' | 'skill'
  equipment: string[]
  is_weighted: boolean
  is_bodyweight: boolean
  default_unit: DefaultUnit         // 'kg'|'lb'|'sec'|'reps' ή δικό σου string
  notes: string | null
  is_archived: boolean
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
  deleted_at: ISOTimestamp | null
}
```
**Index:** `id, user_id, name, category, movement_type, is_archived, deleted_at, [user_id+category]`

### `workouts`
Sessions. `activity_kind` (v2) καθορίζει strength vs. χρόνο/απόσταση-based.

```typescript
{
  id: UUID
  user_id: UUID
  started_at: ISOTimestamp
  ended_at: ISOTimestamp | null
  duration_seconds: number | null
  notes: string | null
  workout_type: string | null       // free-form: "leg day", "push A"
  activity_kind: ActivityKind       // v2 — 'strength'|'run'|'basketball'|… ή δικό σου
  distance_km: number | null        // v2 — running/cycling/swim
  feel: SessionFeel | null          // 1-5
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
  deleted_at: ISOTimestamp | null
}
```
**Index:** `id, user_id, started_at, ended_at, activity_kind, deleted_at, [user_id+started_at]`

### `sets`
Atomic unit δεδομένων. Ένα set = μία εγγραφή.

```typescript
{
  id: UUID
  workout_id: UUID
  exercise_id: UUID
  set_number: number
  weight_kg: number | null          // added weight, null = pure bodyweight
  bodyweight_kg: number | null      // snapshot τη στιγμή του set
  reps: number | null
  hold_seconds: number | null       // isometrics (front lever, plank)
  rpe: number | null                // 1-10
  rir: number | null                // v5 — reps in reserve
  tempo: string | null              // v5 — π.χ. "3-1-1-0"
  is_warmup: boolean
  is_failure: boolean
  set_type: SetType                 // v2 — 'normal'|'warmup'|'dropset'|'superset'|'rest_pause'|'amrap'|'failure' ή δικό σου
  group_id: UUID | null             // v2 — κοινό id για superset/dropset
  notes: string | null
  rest_seconds: number | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
  deleted_at: ISOTimestamp | null
}
```
**Index:** `id, workout_id, exercise_id, set_number, set_type, group_id, deleted_at, [exercise_id+created_at], [workout_id+set_number]`

### `personal_records`
Materialized-view-style. Ξαναϋπολογίζεται σε set save/delete. Από v7, ένα PR ανήκει είτε σε άσκηση (`exercise_id`+`set_id`) είτε σε δραστηριότητα-χωρίς-σετ (`activity_kind`) — ακριβώς ένα από τα δύο ζεύγη είναι μη-null.

```typescript
{
  id: UUID
  user_id: UUID
  exercise_id: UUID | null
  activity_kind: ActivityKind | null   // v7 — μόνο για activity-level PRs (τρέξιμο/ποδήλατο)
  type: PRType                          // 'max_weight'|'max_reps'|'max_volume'|'e1rm'|'max_hold'|'longest_distance'|'longest_duration'|'fastest_pace' ή δικό σου
  value: number
  reps: number | null
  weight_kg: number | null
  achieved_at: ISOTimestamp
  workout_id: UUID
  set_id: UUID | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}
```
**Index:** `id, user_id, exercise_id, activity_kind, type, achieved_at, [user_id+exercise_id+type], [user_id+activity_kind+type]`

### `skills`
System-seeded (`user_id: null`) + από v6 και user-owned (ώστε το δικό σου tree να μη φαίνεται σε άλλο προφίλ της ίδιας συσκευής).

```typescript
{
  id: UUID
  user_id: UUID | null               // v6 — null = κοινό σε όλα τα προφίλ
  name: string
  short_code: string                 // π.χ. "Fl" — periodic-table display
  category: SkillCategory            // 'pull'|'push'|'core'|'lower'|'mixed' ή δικό σου
  description: string
  ultimate_goal: string
  difficulty: 1 | 2 | 3 | 4 | 5
  display_order: number
  is_archived: boolean
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}
```
**Index:** `id, user_id, short_code, category, display_order, is_archived`

### `skill_steps`
System-seeded.

```typescript
{
  id: UUID
  skill_id: UUID
  step_number: number
  name: string
  description: string
  target_type: SkillTargetType       // 'hold'|'reps'|'distance'|'angle' ή δικό σου
  target_value: number
  target_unit: string
  benchmark_video_url: string | null
  prerequisites: UUID[]              // ids άλλων skill_steps
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}
```
**Index:** `id, skill_id, step_number, [skill_id+step_number]`

### `user_skill_progress`
Το state σου σε κάθε skill. Μοναδικό ανά `(user_id, skill_id)`.

```typescript
{
  id: UUID
  user_id: UUID
  skill_id: UUID
  current_step_id: UUID | null
  status: 'locked' | 'in_progress' | 'mastered'
  started_at: ISOTimestamp | null
  mastered_at: ISOTimestamp | null
  notes: string | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}
```
**Index:** `id, user_id, skill_id, status, &[user_id+skill_id]` (`&` = unique)

### `user_skill_step_completions`
Log κάθε φορά που χτυπήθηκε ένα βήμα. Πολλαπλές εγγραφές OK (re-test).

```typescript
{
  id: UUID
  user_id: UUID
  skill_step_id: UUID
  achieved_value: number
  achieved_at: ISOTimestamp
  workout_id: UUID | null
  notes: string | null
  created_at: ISOTimestamp
}
```
**Index:** `id, user_id, skill_step_id, achieved_at, workout_id`

### `app_settings`
Μία εγγραφή ανά χρήστη.

```typescript
{
  id: UUID
  user_id: UUID
  default_rest_timer_seconds: number
  dashboard_cards: { key: string; visible: boolean }[]   // v8 — σειρά/ορατότητα καρτών Αρχικής
  notify_pr: boolean
  notify_session_reminder: boolean
  notify_rest_timer: boolean         // v4
  reminder_time: string | null       // "18:00" ή null
  reminder_days: number[]            // [1,3,5] = Δευ/Τετ/Παρ
  show_e1rm: boolean
  weight_unit: 'kg' | 'lb'
  theme: 'dark' | 'light' | 'auto'
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}
```
**Index:** `id, &user_id` (`&` = unique)

### `body_metrics`
Μέτρηση σώματος/διατροφής — χρονοσειρά, μία εγγραφή/μέρα. **Υπάρχει από v2.**

```typescript
{
  id: UUID
  user_id: UUID
  date: string                       // τοπική YYYY-MM-DD, μία εγγραφή/μέρα
  weight_kg: number | null
  calories_in: number | null
  calories_out: number | null
  protein_g: number | null
  carbs_g: number | null             // v7
  fat_g: number | null               // v7
  body_fat_pct: number | null
  notes: string | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}
```
**Index:** `id, user_id, date, &[user_id+date]` (`&` = unique — ένα record/μέρα)

### `programs`
Αποθηκευμένο πλάνο προπόνησης· *δεν* είναι workout, είναι το πρότυπο από το οποίο ξεκινά ένα workout. **Υπάρχει από v3.**

```typescript
{
  id: UUID
  user_id: UUID
  name: string
  description: string | null
  activity_kind: ActivityKind
  display_order: number
  target_sessions_per_week: number | null   // v7 — null = χωρίς στόχο συχνότητας
  is_archived: boolean
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
  deleted_at: ISOTimestamp | null
}
```
**Index:** `id, user_id, name, activity_kind, display_order, is_archived, deleted_at`

### `program_exercises`
Μία γραμμή του πλάνου: άσκηση + στόχοι. **Υπάρχει από v3.**

```typescript
{
  id: UUID
  program_id: UUID
  exercise_id: UUID
  position: number
  target_sets: number | null
  target_reps: number | null
  target_weight_kg: number | null
  target_hold_seconds: number | null
  set_type: SetType
  group_key: string | null           // superset/dropset ομαδοποίηση μέσα στο πλάνο
  notes: string | null
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}
```
**Index:** `id, program_id, exercise_id, position, [program_id+position]`

### `activities`
Δικά σου αθλήματα/είδη προπόνησης. Τα 8 built-in υπάρχουν ως εγγραφές `is_builtin: true` (κρύψιμο/μετονομασία δυνατά). **Υπάρχει από v5.**

```typescript
{
  id: UUID
  user_id: UUID | null
  key: string                        // σταθερό key, γράφεται σε workouts.activity_kind
  label: string
  icon: string                       // ελεύθερο emoji/σύμβολο
  dot_class: string                  // tailwind class για κουκκίδα ημερολογίου
  uses_sets: boolean                 // true = logger με σετ, false = χρόνος/απόσταση
  tracks_distance: boolean
  is_builtin: boolean
  display_order: number
  is_archived: boolean
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
}
```
**Index:** `id, user_id, &key, display_order, is_archived, is_builtin` (`&` = unique)

### `goals`
Στόχος στα μέτρα του χρήστη: μέτρο × ποσό × περίοδος × εύρος, ανεξάρτητοι άξονες. **Υπάρχει από v8.**

```typescript
{
  id: UUID
  user_id: UUID
  label: string | null               // δικό όνομα, αλλιώς παράγεται
  metric: GoalMetric                  // 'sessions'|'volume_kg'|'sets'|'reps'|'distance_km'|'duration_min'
  target: number
  period: GoalPeriod                  // 'week'|'month'|'day'
  period_anchor: GoalPeriodAnchor      // v9 — 'calendar' | 'rolling'
  activity_key: ActivityKind | null   // null = όλες οι δραστηριότητες
  exercise_id: UUID | null            // null = όλες οι ασκήσεις
  display_order: number
  is_archived: boolean
  created_at: ISOTimestamp
  updated_at: ISOTimestamp
  deleted_at: ISOTimestamp | null
}
```
**Index:** `id, user_id, metric, period, activity_key, exercise_id, display_order, is_archived, deleted_at, [user_id+is_archived]`

### `events_outgoing`
Cross-app bridge (π.χ. calorie tracker). **Υπάρχει από v1.**

```typescript
{
  id: UUID
  user_id: UUID
  event_type: 'workout.completed' | 'workout.started'
  payload: Record<string, unknown>
  target_app: 'calorie_tracker'
  emitted_at: ISOTimestamp
  delivered_at: ISOTimestamp | null
  created_at: ISOTimestamp
}
```
**Index:** `id, user_id, event_type, target_app, delivered_at, emitted_at`

---

## Ιστορικό εκδόσεων (v1 → v10)

Ζει ολόκληρο σε `src/lib/db/schema.ts` — κάθε `this.version(N)` block κουβαλάει το δικό του `.stores()` (index αλλαγές) και προαιρετικό `.upgrade()` (data backfill). Dexie συσσωρεύει: ένας πίνακας που δεν αναφέρεται σε νεότερο version κρατά το προηγούμενο index set του.

| v | Τι πρόσθεσε | Migration |
|---|---|---|
| **v1** | Αρχικό σχήμα: `users, exercises, workouts, sets, personal_records, skills, skill_steps, user_skill_progress, user_skill_step_completions, app_settings, events_outgoing` | — |
| **v2** | Πολλαπλές δραστηριότητες/μέρα (`activity_kind`, `distance_km` στο workouts), τύποι σετ (`set_type`, `group_id`), νέος πίνακας `body_metrics` | backfill `workouts.activity_kind ??= 'strength'`, `distance_km ??= null`· `sets.set_type` παράγεται από `is_warmup`/`is_failure`, `group_id ??= null` |
| **v3** | Νέοι πίνακες `programs`, `program_exercises` (αποθηκευμένα προγράμματα) | — (μόνο νέοι πίνακες) |
| **v4** | `app_settings.notify_rest_timer` (ειδοποίηση rest timer) | backfill `notify_rest_timer ??= true` |
| **v5** | Δικές σου δραστηριότητες: νέος πίνακας `activities`· `sets.rir`/`sets.tempo` | backfill `sets.rir ??= null`, `tempo ??= null` |
| **v6** | Πολλαπλά προφίλ/συσκευή: `skills.user_id` | backfill `skills.user_id ??= null` (seeded = κοινά) |
| **v7** | Ενιαίο PR σύστημα (`personal_records.activity_kind` + compound index)· `programs.target_sessions_per_week`· `body_metrics.carbs_g`/`fat_g` | backfill και στα τρία, `??= null` |
| **v8** | Στόχοι: νέος πίνακας `goals`· `app_settings.dashboard_cards` | backfill `dashboard_cards ??= []` (κενό = καμία προτίμηση, όχι invented) |
| **v9** | `goals.period_anchor` (ημερολογιακή vs κυλιόμενη περίοδος) | backfill `period_anchor ??= 'rolling'` — **όχι** `'calendar'`, γιατί έτσι μετρούσαν ήδη οι υπάρχοντες στόχοι· ένα σιωπηλό backfill σε `calendar` θα άλλαζε νόημα χωρίς να το ζητήσει κανείς |
| **v10** | `app_settings.auto_start_rest_timer` (auto-start rest timer μετά από σετ) | backfill `??= true` — ίδιο pattern με v4 `notify_rest_timer` |

---

## Κανόνες εξέλιξης schema (αυτό που ακολουθεί ο κώδικας, όχι θεωρία)

1. **Additive-only versions.** Κάθε `this.version(N)` προσθέτει πεδία/πίνακες/indexes· ποτέ αφαίρεση/μετονομασία σε υπάρχον version — αλλιώς σπάει σε παλιά εγκατεστημένη βάση.
2. **`??=` backfills, όχι overwrite.** Κάθε `.upgrade()` γεμίζει *μόνο* undefined πεδία σε υπάρχουσες εγγραφές (`s.field ??= default`) — μηδέν rewrite δεδομένων που ήδη έχουν τιμή.
3. **`SCHEMA_VERSION` constant** (`schema.ts`) γράφεται στο `User.schema_version` κατά τη δημιουργία προφίλ (`bootstrap.ts`) και σε κάθε αλλαγή προφίλ (`queries.ts`) — δείχνει με ποια έκδοση schema δημιουργήθηκε/ενημερώθηκε ο κάθε χρήστης.
4. **Soft deletes.** Πίνακες με user data κρατούν `deleted_at: ISOTimestamp | null` και ποτέ hard-delete εγγραφή· sync-ready εξ ορισμού (μια offline διαγραφή δεν "αναστήνεται" από άλλη συσκευή).
5. **`updated_at` discipline.** Κάθε write στο `lib/db/queries.ts`/`goals.ts` ενημερώνει το `updated_at` της εγγραφής — last-write-wins ανά record είναι έτοιμο πριν καν υπάρξει sync.
6. **Δεν σβήνουμε defaults στο τυχαίο.** Όταν ένα νέο πεδίο θα σήμαινε επινοημένο δεδομένο (π.χ. v8 `dashboard_cards`), το backfill πάει σε "κενό/null" ποτέ σε μαντεμένη τιμή.

---

## Server sync (σε εξέλιξη — δεν έχει shippάρει)

> Ενημέρωση: το παλιό πλάνο "Supabase Pro tier" (βλ. `src/lib/sync/index.ts` stub) **αντικαθίσταται**.
> Το πραγματικό πλάνο τώρα είναι **δικό μας backend σε Rust/Axum, self-hosted** — όχι Supabase/Postgres-as-a-service. Βρίσκεται σε εξέλιξη παράλληλα με αυτό το αρχείο· βλ. `VISION-NEXT.md` για το ενεργό μέτωπο (accounts/auth, per-user sync, admin role).

Ό,τι μένει ίδιο ανεξάρτητα από τον server: IndexedDB παραμένει η πηγή αλήθειας στη συσκευή· ο server είναι αντίγραφο + γέφυρα μεταξύ συσκευών· last-write-wins ανά εγγραφή μέσω `updated_at`· soft-deletes ώστε μια offline διαγραφή να μη "ζωντανέψει" ξανά.

---

## Φιλοσοφία σχεδιαστικών αποφάσεων

1. **Sets είναι atomic** — όχι nested arrays μέσα σε workouts. Ευκολότερο sync, ευκολότερα analytics.
2. **`bodyweight_kg` snapshot σε κάθε set** — ώστε weighted-calisthenics analytics να είναι σωστά ό,τι κι αν αλλάξει το bodyweight αργότερα· παλιά PRs δεν επαναϋπολογίζονται.
3. **PRs σε ξεχωριστό πίνακα** — pre-computed για instant display, re-computed σε set save/delete.
4. **Skill progression ξεχωριστά από sets** — ένα skill step μπορεί να χτυπηθεί εκτός workout (warm-up, ad-hoc), γι' αυτό το `user_skill_step_completions.workout_id` είναι nullable.
5. **Body-weight tracking ΥΠΑΡΧΕΙ εδώ, από v2.** Ο πίνακας `body_metrics` (βάρος, θερμίδες, macros, body-fat%) ζει στο ίδιο app — δείτε `PROJECT_SCOPE.md` §3 για το πότε/γιατί ενσωματώθηκε η θρεπτική/σωματομετρική καταγραφή. Το `sets.bodyweight_kg` παραμένει *επιπλέον*, ως per-set snapshot, όχι υποκατάστατο.
