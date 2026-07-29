# Anabasis — Database Schema

> **IndexedDB (local) + Supabase Postgres (Pro tier sync).** Same shape. Schema versioned από v1.

---

## Design principles

1. **UUIDs everywhere** — no auto-increment, sync-friendly
2. **Soft deletes** (`deleted_at` timestamp) — never hard delete, για undo/sync
3. **`updated_at` σε όλους τους πίνακες** — last-write-wins per field
4. **Client-generated timestamps** — ώστε offline writes να έχουν correct order
5. **Schema version field** στο `User` table — για migrations

---

## Core tables

### `users` (1 row local, multi στο Supabase)
```typescript
{
  id: uuid                     // PK
  email: string | null         // null για local-only users
  display_name: string | null
  units: 'metric' | 'imperial' // default 'metric'
  bodyweight_unit: 'kg' | 'lb' // separate από weight unit για flexibility
  language: 'en' | 'el'        // default 'en'
  schema_version: int          // για migrations
  created_at: timestamp
  updated_at: timestamp
  is_pro: boolean              // Pro tier flag (Supabase only)
  pro_expires_at: timestamp | null
}
```

### `exercises`
**Library of exercises. Pre-seeded + user-created.**

```typescript
{
  id: uuid                                    // PK
  user_id: uuid | null                        // null για system-seeded, set για user-created
  name: string                                // "Bench Press"
  category: 'push' | 'pull' | 'legs' | 'core' | 'other'
  movement_type: 'compound' | 'isolation' | 'skill'
  equipment: string[]                         // ['barbell', 'bench']
  is_weighted: boolean                        // default true
  is_bodyweight: boolean                      // για pull-ups, dips κλπ — όπου το bodyweight μετράει
  default_unit: 'kg' | 'lb' | 'sec' | 'reps'  // default unit για logging
  notes: string | null
  is_archived: boolean
  created_at: timestamp
  updated_at: timestamp
  deleted_at: timestamp | null
}
```

### `workouts` (sessions)
```typescript
{
  id: uuid                          // PK
  user_id: uuid                     // FK
  started_at: timestamp
  ended_at: timestamp | null        // null όσο active
  duration_seconds: int | null      // computed στο close
  notes: string | null
  workout_type: string | null       // free-form: "leg day", "push A", "skills only"
  feel: 1 | 2 | 3 | 4 | 5 | null    // optional self-rated session quality
  created_at: timestamp
  updated_at: timestamp
  deleted_at: timestamp | null
}
```

### `sets`
**Atomic unit of training data. Ένα set = ένα row.**

```typescript
{
  id: uuid                       // PK
  workout_id: uuid               // FK
  exercise_id: uuid              // FK
  set_number: int                // 1, 2, 3... order μέσα στο workout
  weight_kg: float | null        // added weight (null για pure bodyweight)
  bodyweight_kg: float | null    // user's bodyweight at time (snapshot, για analytics)
  reps: int | null               // null για time-based skills
  hold_seconds: int | null       // για isometric (front lever, plank)
  rpe: float | null              // 1-10, optional, v2 feature
  is_warmup: boolean             // default false
  is_failure: boolean            // hit failure flag
  notes: string | null
  rest_seconds: int | null       // time before next set (auto-tracked)
  created_at: timestamp
  updated_at: timestamp
  deleted_at: timestamp | null
}
```

### `personal_records`
**Materialized view-style table. Updated on set save.**

```typescript
{
  id: uuid                          // PK
  user_id: uuid                     // FK
  exercise_id: uuid                 // FK
  type: 'max_weight' | 'max_reps' | 'max_volume' | 'e1rm' | 'max_hold'
  value: float                      // weight in kg, reps count, volume kg, e1RM kg, sec
  reps: int | null                  // αν τύπος είναι max_weight, ποια reps
  weight_kg: float | null           // αν τύπος είναι max_reps, σε ποιο βάρος
  achieved_at: timestamp            // πότε χτυπήθηκε
  workout_id: uuid                  // FK ποιο session
  set_id: uuid                      // FK ποιο set
  created_at: timestamp
  updated_at: timestamp
}
```

### `skills` (system-seeded)
```typescript
{
  id: uuid
  name: string                       // "Front Lever"
  short_code: string                 // "Fl" — για periodic table display
  category: 'pull' | 'push' | 'core' | 'lower' | 'mixed'
  description: string
  ultimate_goal: string              // "Full hold 5 seconds"
  difficulty: 1 | 2 | 3 | 4 | 5      // intermediate → elite
  display_order: int
  is_archived: boolean
  created_at: timestamp
  updated_at: timestamp
}
```

### `skill_steps` (system-seeded)
```typescript
{
  id: uuid                          // PK
  skill_id: uuid                    // FK
  step_number: int                  // 1, 2, 3...
  name: string                      // "Tuck Front Lever"
  description: string
  target_type: 'hold' | 'reps' | 'distance' | 'angle'
  target_value: float               // 5 (sec), 3 (reps), etc.
  target_unit: string               // 'sec', 'reps'
  benchmark_video_url: string | null  // YouTube embed
  prerequisites: uuid[]             // FK array → άλλα skill_steps
  created_at: timestamp
  updated_at: timestamp
}
```

### `user_skill_progress`
**User's state σε κάθε skill.**

```typescript
{
  id: uuid                          // PK
  user_id: uuid                     // FK
  skill_id: uuid                    // FK
  current_step_id: uuid | null      // FK → skill_steps
  status: 'locked' | 'in_progress' | 'mastered'
  started_at: timestamp | null      // πότε άρχισε αυτό το skill
  mastered_at: timestamp | null     // πότε χτύπησε ultimate goal
  notes: string | null
  created_at: timestamp
  updated_at: timestamp
}
```

### `user_skill_step_completions`
**Log κάθε step που χτυπήθηκε. Multiple entries OK (re-test).**

```typescript
{
  id: uuid                          // PK
  user_id: uuid                     // FK
  skill_step_id: uuid               // FK
  achieved_value: float             // π.χ. held 6 sec on a 5sec target
  achieved_at: timestamp
  workout_id: uuid | null           // FK αν έγινε σε workout
  notes: string | null
  created_at: timestamp
}
```

---

## Settings / preferences

### `app_settings`
```typescript
{
  id: uuid
  user_id: uuid                          // FK
  default_rest_timer_seconds: int        // default 180
  notify_pr: boolean                     // ping on new PR
  notify_session_reminder: boolean
  reminder_time: string | null           // "18:00" or null
  reminder_days: int[]                   // [1,3,5] = Mon/Wed/Fri
  show_e1rm: boolean                     // default true
  weight_unit: 'kg' | 'lb'
  theme: 'dark' | 'light' | 'auto'
  created_at: timestamp
  updated_at: timestamp
}
```

---

## Sync / cross-app (v2+)

### `events_outgoing` (cross-app bridge)
```typescript
{
  id: uuid
  user_id: uuid
  event_type: 'workout.completed' | 'workout.started'
  payload: jsonb                    // { workout_id, duration, type }
  target_app: 'calorie_tracker'
  emitted_at: timestamp
  delivered_at: timestamp | null
  created_at: timestamp
}
```

---

## Indexes (Supabase / IndexedDB)

```
sets:               (workout_id), (exercise_id, created_at), (user_id, created_at)
workouts:           (user_id, started_at DESC)
personal_records:   (user_id, exercise_id, type)
user_skill_progress: (user_id, skill_id) UNIQUE
exercises:          (user_id, category), (name) full-text
```

---

## RLS policies (Supabase only)

```sql
-- κάθε row ορατό μόνο στον owner
CREATE POLICY user_isolation ON workouts
  FOR ALL USING (user_id = auth.uid());
-- ίδιο pattern για: sets, personal_records, user_skill_progress, app_settings
-- exception: skills, skill_steps (system data, public read-only)
```

---

## Schema migrations

```typescript
// /lib/db/migrations.ts
const migrations = {
  1: (db) => { /* initial v1 schema */ },
  2: (db) => { /* v2: add RPE field */ },
  // ...
};
```

---

## Φιλοσοφία schema decisions

1. **Sets είναι atomic** — όχι nested arrays μέσα σε workouts. Easier sync, easier analytics.
2. **`bodyweight_kg` snapshot στο κάθε set** — ώστε weighted calisthenics analytics να είναι σωστά. Αν το BW του user αλλάξει, παλιά PRs δεν επαναϋπολογίζονται.
3. **PRs σε ξεχωριστό table** — pre-computed για instant display. Re-computed σε set save/delete.
4. **Skill progression separate από sets** — skill achievement δεν είναι πάντα μέσα σε workout (μπορεί να γίνει warm-up ή ad-hoc).
5. **No body weight tracking table εδώ** — εξαίρεση: το `bodyweight_kg` field στο sets είναι snapshot, όχι historical log. Body weight history ζει στο **calorie app**, queryable cross-app μέσω events.
