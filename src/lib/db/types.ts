/**
 * Anabasis — Domain types.
 * Mirrors DATABASE_SCHEMA.md exactly. Same field names, same shape, same units.
 */

export type UUID = string;
export type ISOTimestamp = string;

export type Units = 'metric' | 'imperial';
export type WeightUnit = 'kg' | 'lb';
export type Language = 'en' | 'el';
export type Theme = 'dark' | 'light' | 'auto';

export type ExerciseCategory = 'push' | 'pull' | 'legs' | 'core' | 'other';
export type MovementType = 'compound' | 'isolation' | 'skill';
export type DefaultUnit = 'kg' | 'lb' | 'sec' | 'reps';

export type SkillCategory = 'pull' | 'push' | 'core' | 'lower' | 'mixed';
export type SkillStatus = 'locked' | 'in_progress' | 'mastered';
export type SkillTargetType = 'hold' | 'reps' | 'distance' | 'angle';

export type PRType =
  | 'max_weight'
  | 'max_reps'
  | 'max_volume'
  | 'e1rm'
  | 'max_hold';

export type SessionFeel = 1 | 2 | 3 | 4 | 5;

/**
 * Τι είδος δραστηριότητα. Το `strength` έχει σετ/επαναλήψεις· τα υπόλοιπα
 * μετρούνται με διάρκεια (και προαιρετικά απόσταση), γι' αυτό τα κρατάμε
 * στον ίδιο πίνακα workouts αλλά με διαφορετικά πεδία μέτρησης.
 */
export type ActivityKind =
  | 'strength'
  | 'skill'
  | 'run'
  | 'basketball'
  | 'cycling'
  | 'swim'
  | 'mobility'
  | 'other';

/** Πώς εκτελέστηκε ένα σετ — dropset/superset/rest-pause αλλάζουν το νόημα του όγκου. */
export type SetType =
  | 'normal'
  | 'warmup'
  | 'dropset'
  | 'superset'
  | 'rest_pause'
  | 'amrap'
  | 'failure';

/** Μέτρηση σώματος/διατροφής — χρονοσειρά, μία εγγραφή ανά μέρα. */
export interface BodyMetric {
  id: UUID;
  user_id: UUID;
  /** τοπική ημερομηνία YYYY-MM-DD — ένα record ανά μέρα */
  date: string;
  weight_kg: number | null;
  calories_in: number | null;
  calories_out: number | null;
  protein_g: number | null;
  body_fat_pct: number | null;
  notes: string | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/* ────────────────────────────────────────────────────────────── */

export interface User {
  id: UUID;
  email: string | null;
  display_name: string | null;
  units: Units;
  bodyweight_unit: WeightUnit;
  language: Language;
  schema_version: number;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  is_pro: boolean;
  pro_expires_at: ISOTimestamp | null;
}

export interface Exercise {
  id: UUID;
  user_id: UUID | null;
  name: string;
  category: ExerciseCategory;
  movement_type: MovementType;
  equipment: string[];
  is_weighted: boolean;
  is_bodyweight: boolean;
  default_unit: DefaultUnit;
  notes: string | null;
  is_archived: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at: ISOTimestamp | null;
}

export interface Workout {
  id: UUID;
  user_id: UUID;
  started_at: ISOTimestamp;
  ended_at: ISOTimestamp | null;
  duration_seconds: number | null;
  notes: string | null;
  workout_type: string | null;
  /** v2: τι άθλημα/δραστηριότητα. Παλιές εγγραφές γίνονται 'strength'. */
  activity_kind: ActivityKind;
  /** v2: για running/cycling/swim */
  distance_km: number | null;
  feel: SessionFeel | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at: ISOTimestamp | null;
}

export interface SetEntry {
  id: UUID;
  workout_id: UUID;
  exercise_id: UUID;
  set_number: number;
  weight_kg: number | null;
  bodyweight_kg: number | null;
  reps: number | null;
  hold_seconds: number | null;
  rpe: number | null;
  is_warmup: boolean;
  is_failure: boolean;
  /** v2: τύπος σετ (dropset/superset/rest-pause…). Παλιά σετ = 'normal'/'warmup'. */
  set_type: SetType;
  /**
   * v2: κοινό id για σετ που εκτελούνται μαζί.
   * superset = ίδιο group_id, ΔΙΑΦΟΡΕΤΙΚΕΣ ασκήσεις.
   * dropset  = ίδιο group_id, ΙΔΙΑ άσκηση, φθίνον βάρος.
   */
  group_id: UUID | null;
  notes: string | null;
  rest_seconds: number | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at: ISOTimestamp | null;
}

export interface PersonalRecord {
  id: UUID;
  user_id: UUID;
  exercise_id: UUID;
  type: PRType;
  value: number;
  reps: number | null;
  weight_kg: number | null;
  achieved_at: ISOTimestamp;
  workout_id: UUID;
  set_id: UUID;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Skill {
  id: UUID;
  name: string;
  short_code: string;
  category: SkillCategory;
  description: string;
  ultimate_goal: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  display_order: number;
  is_archived: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface SkillStep {
  id: UUID;
  skill_id: UUID;
  step_number: number;
  name: string;
  description: string;
  target_type: SkillTargetType;
  target_value: number;
  target_unit: string;
  benchmark_video_url: string | null;
  prerequisites: UUID[];
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface UserSkillProgress {
  id: UUID;
  user_id: UUID;
  skill_id: UUID;
  current_step_id: UUID | null;
  status: SkillStatus;
  started_at: ISOTimestamp | null;
  mastered_at: ISOTimestamp | null;
  notes: string | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface UserSkillStepCompletion {
  id: UUID;
  user_id: UUID;
  skill_step_id: UUID;
  achieved_value: number;
  achieved_at: ISOTimestamp;
  workout_id: UUID | null;
  notes: string | null;
  created_at: ISOTimestamp;
}

export interface AppSettings {
  id: UUID;
  user_id: UUID;
  default_rest_timer_seconds: number;
  notify_pr: boolean;
  notify_session_reminder: boolean;
  reminder_time: string | null;
  reminder_days: number[];
  show_e1rm: boolean;
  weight_unit: WeightUnit;
  theme: Theme;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface OutgoingEvent {
  id: UUID;
  user_id: UUID;
  event_type: 'workout.completed' | 'workout.started';
  payload: Record<string, unknown>;
  target_app: 'calorie_tracker';
  emitted_at: ISOTimestamp;
  delivered_at: ISOTimestamp | null;
  created_at: ISOTimestamp;
}

/* ─────────── Programs / routines (v3) ─────────── */

/**
 * Ένα αποθηκευμένο πλάνο προπόνησης. Δεν είναι workout — είναι το πρότυπο
 * από το οποίο ΞΕΚΙΝΑΕΙ ένα workout. Ο χρήστης μπορεί να το φτιάξει επί
 * τόπου στο γυμναστήριο και να το ξανα-χρησιμοποιήσει.
 */
export interface Program {
  id: UUID;
  user_id: UUID;
  name: string;
  description: string | null;
  activity_kind: ActivityKind;
  /** σειρά εμφάνισης στη λίστα */
  display_order: number;
  is_archived: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at: ISOTimestamp | null;
}

/** Μια γραμμή του πλάνου: άσκηση + στόχοι. */
export interface ProgramExercise {
  id: UUID;
  program_id: UUID;
  exercise_id: UUID;
  position: number;
  target_sets: number | null;
  target_reps: number | null;
  target_weight_kg: number | null;
  target_hold_seconds: number | null;
  set_type: SetType;
  /** superset/dropset ομαδοποίηση μέσα στο πλάνο */
  group_key: string | null;
  notes: string | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}
