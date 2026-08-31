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

/**
 * Οι ενσωματωμένες κατηγορίες. Το `& {}` στο union κρατάει το autocomplete
 * ζωντανό ΕΝΩ επιτρέπει οποιοδήποτε δικό σου string — το app δεν σε κλειδώνει
 * σε πέντε κουτάκια που διάλεξε κάποιος άλλος.
 */
export const BUILTIN_EXERCISE_CATEGORIES = [
  'push',
  'pull',
  'legs',
  'core',
  'other',
] as const;
export type BuiltinExerciseCategory = (typeof BUILTIN_EXERCISE_CATEGORIES)[number];
export type ExerciseCategory = BuiltinExerciseCategory | (string & {});
export type MovementType = 'compound' | 'isolation' | 'skill';
export const BUILTIN_DEFAULT_UNITS = ['kg', 'lb', 'sec', 'reps'] as const;
export type BuiltinDefaultUnit = (typeof BUILTIN_DEFAULT_UNITS)[number];
/** Ελεύθερο string — μέτρα, θερμίδες, όροφοι, ό,τι μετράει η δική σου άσκηση. */
export type DefaultUnit = BuiltinDefaultUnit | (string & {});

export const BUILTIN_SKILL_CATEGORIES = [
  'pull',
  'push',
  'core',
  'lower',
  'mixed',
] as const;
export type BuiltinSkillCategory = (typeof BUILTIN_SKILL_CATEGORIES)[number];
export type SkillCategory = BuiltinSkillCategory | (string & {});
export type SkillStatus = 'locked' | 'in_progress' | 'mastered';
export const BUILTIN_SKILL_TARGET_TYPES = [
  'hold',
  'reps',
  'distance',
  'angle',
] as const;
export type BuiltinSkillTargetType = (typeof BUILTIN_SKILL_TARGET_TYPES)[number];
export type SkillTargetType = BuiltinSkillTargetType | (string & {});

export const BUILTIN_PR_TYPES = [
  'max_weight',
  'max_reps',
  'max_volume',
  'e1rm',
  'max_hold',
  /** v7: PRs για δραστηριότητες χωρίς άσκηση (τρέξιμο/ποδήλατο/κολύμβηση) */
  'longest_distance',
  'longest_duration',
  'fastest_pace',
] as const;
export type BuiltinPRType = (typeof BUILTIN_PR_TYPES)[number];
export type PRType = BuiltinPRType | (string & {});

export type SessionFeel = 1 | 2 | 3 | 4 | 5;

/**
 * Τι είδος δραστηριότητα. Το `strength` έχει σετ/επαναλήψεις· τα υπόλοιπα
 * μετρούνται με διάρκεια (και προαιρετικά απόσταση), γι' αυτό τα κρατάμε
 * στον ίδιο πίνακα workouts αλλά με διαφορετικά πεδία μέτρησης.
 */
export const BUILTIN_ACTIVITY_KINDS = [
  'strength',
  'skill',
  'run',
  'basketball',
  'cycling',
  'swim',
  'mobility',
  'other',
] as const;
export type BuiltinActivityKind = (typeof BUILTIN_ACTIVITY_KINDS)[number];
/**
 * Οποιοδήποτε δικό σου άθλημα (boxing, yoga, πεζοπορία…) είναι έγκυρο kind —
 * αρκεί να υπάρχει αντίστοιχη εγγραφή στον πίνακα `activities`. Τα builtin
 * keys μένουν για autocomplete και για τα seeded δεδομένα.
 */
export type ActivityKind = BuiltinActivityKind | (string & {});

/** Πώς εκτελέστηκε ένα σετ — dropset/superset/rest-pause αλλάζουν το νόημα του όγκου. */
export const BUILTIN_SET_TYPES = [
  'normal',
  'warmup',
  'dropset',
  'superset',
  'rest_pause',
  'amrap',
  'failure',
] as const;
export type BuiltinSetType = (typeof BUILTIN_SET_TYPES)[number];
/** Ελεύθερο string — cluster set, myo-reps, ό,τι τεχνική θέλεις ονομάσεις. */
export type SetType = BuiltinSetType | (string & {});

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
  /** v7 */
  carbs_g: number | null;
  /** v7 */
  fat_g: number | null;
  body_fat_pct: number | null;
  /** v11: χειροκίνητα βήματα ημέρας (δεν διαβάζουμε HealthKit — ο χρήστης τα περνά) */
  steps: number | null;
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
  /** v12: από ποιο πρόγραμμα/μέρα ξεκίνησε (null/null = ad-hoc/random προπόνηση) */
  program_id: UUID | null;
  program_day_id: UUID | null;
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
  /** 1-10 — πόσο κοντά στην αποτυχία ήταν το σετ */
  rpe: number | null;
  /** v5: επαναλήψεις που έμεναν στο ρεζερβουάρ (reps in reserve) */
  rir: number | null;
  /** v5: ρυθμός εκτέλεσης, π.χ. "3-1-1-0" (κατέβασμα-παύση-ανέβασμα-παύση) */
  tempo: string | null;
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

/**
 * v7: ένα PR ανήκει είτε σε άσκηση (`exercise_id` + `set_id`) είτε σε
 * δραστηριότητα χωρίς σετ (`activity_kind`) — ένας δρομέας/κολυμβητής
 * αξίζει το ίδιο σύστημα ρεκόρ με έναν lifter. Ακριβώς ένα από τα δύο
 * ζεύγη είναι μη-null.
 */
export interface PersonalRecord {
  id: UUID;
  user_id: UUID;
  exercise_id: UUID | null;
  /** μόνο για activity-level PRs (χωρίς άσκηση) */
  activity_kind: ActivityKind | null;
  type: PRType;
  value: number;
  reps: number | null;
  weight_kg: number | null;
  achieved_at: ISOTimestamp;
  workout_id: UUID;
  set_id: UUID | null;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

export interface Skill {
  id: UUID;
  /** null = seeded, κοινό σε όλα τα προφίλ· αλλιώς ανήκει σε ένα προφίλ */
  user_id: UUID | null;
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
  /** v13: προαιρετικό βάρος στόχου — «full front lever + 5kg». Μία ακόμα διάσταση
   *  δυσκολίας πέρα από τον μοχλό (leverage steps): ανεβάζεις με βάρος σε διάφορα σημεία. */
  added_weight_kg: number | null;
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
  /** v13: το βάρος που χρησιμοποίησες όταν το πέτυχες (null = bodyweight) */
  added_weight_kg: number | null;
  achieved_at: ISOTimestamp;
  workout_id: UUID | null;
  notes: string | null;
  created_at: ISOTimestamp;
}

/* ───────────────────────── Στόχοι ───────────────────────── */

/**
 * Τι μετράει ένας στόχος. Κάθε metric δουλεύει σε διαφορετικά αθλήματα —
 * γι' αυτό ο στόχος ΔΕΝ είναι ένα σταθερό «όγκος/εβδομάδα»: ο δρομέας μετρά
 * χιλιόμετρα, ο calisthenics αθλητής σετ ή προπονήσεις, ο powerlifter kg.
 */
export const BUILTIN_GOAL_METRICS = [
  'sessions', // πλήθος προπονήσεων
  'volume_kg', // Σ(βάρος × επαναλήψεις)
  'sets', // πλήθος σετ (χωρίς warm-up)
  'reps', // πλήθος επαναλήψεων
  'distance_km',
  'duration_min',
  'skill_steps', // σκαλιά ενός skill που έχεις κατακτήσει (milestone, χωρίς παράθυρο)
] as const;
export type GoalMetric = (typeof BUILTIN_GOAL_METRICS)[number];

/** Το μήκος του παραθύρου μέτρησης. */
export const BUILTIN_GOAL_PERIODS = ['week', 'month', 'day'] as const;
export type GoalPeriod = (typeof BUILTIN_GOAL_PERIODS)[number];

/**
 * ΠΟΥ ξεκινά το παράθυρο — και οι δύο απόψεις είναι σωστές:
 *
 *  `calendar` — «αυτή την εβδομάδα»: Δευτέρα→Κυριακή, 1η→τέλος μήνα. Έχει
 *    προθεσμία· την Κυριακή το βράδυ ξέρεις αν τα κατάφερες και τη Δευτέρα
 *    μηδενίζει. Έτσι σκέφτονται οι περισσότεροι.
 *  `rolling` — «τις τελευταίες 7 μέρες»: το παράθυρο σέρνεται μαζί σου.
 *    Δεν υπάρχει προθεσμία, μόνο ρυθμός· δεν σε «τιμωρεί» επειδή η εβδομάδα
 *    σου δεν ξεκινά Δευτέρα.
 *
 * Δεν διαλέγουμε εμείς: ο χρήστης το ορίζει ανά στόχο.
 */
export const BUILTIN_PERIOD_ANCHORS = ['calendar', 'rolling'] as const;
export type GoalPeriodAnchor = (typeof BUILTIN_PERIOD_ANCHORS)[number];

/**
 * Ένας στόχος στα μέτρα του χρήστη.
 *
 * Σκόπιμα *τέσσερις* ανεξάρτητοι άξονες (μέτρο × ποσό × περίοδος × εύρος)
 * αντί για ένα προκαθορισμένο «εβδομαδιαίος όγκος»: έτσι εκφράζονται και το
 * «4 προπονήσεις/εβδομάδα», και το «20 km τρέξιμο/μήνα», και το «100 σετ
 * έλξεων/μήνα» — χωρίς νέο κώδικα για κάθε περίπτωση.
 *
 * `activity_key`/`exercise_id` = null σημαίνει «όλα». Ο συνδυασμός τους
 * δίνει το εύρος: όλη η προπόνηση, ένα άθλημα, ή μία συγκεκριμένη άσκηση.
 */
export interface Goal {
  id: UUID;
  user_id: UUID;
  /** Δικό του όνομα, αν το θέλει· αλλιώς παράγεται από τα υπόλοιπα πεδία. */
  label: string | null;
  metric: GoalMetric;
  target: number;
  period: GoalPeriod;
  /** Ημερολογιακό («αυτή την εβδομάδα») ή κυλιόμενο («τελευταίες 7 μέρες»). */
  period_anchor: GoalPeriodAnchor;
  /** null = όλες οι δραστηριότητες */
  activity_key: ActivityKind | null;
  /** null = όλες οι ασκήσεις (έχει νόημα σε volume/sets/reps) */
  exercise_id: UUID | null;
  /** Το skill-στόχος (μόνο σε metric `skill_steps`)· null αλλιώς. */
  skill_id?: UUID | null;
  display_order: number;
  is_archived: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at: ISOTimestamp | null;
}

export interface AppSettings {
  id: UUID;
  user_id: UUID;
  default_rest_timer_seconds: number;
  /**
   * Διάταξη της Αρχικής: σειρά + ορατότητα ανά κάρτα. Ζει εδώ (και όχι στο
   * localStorage) ώστε να ταξιδεύει με το export/import και με μελλοντικό sync
   * — η «δική μου αρχική» είναι δεδομένο του χρήστη, όχι της συσκευής.
   * Άγνωστα κλειδιά αγνοούνται, νέα κάρτα εμφανίζεται στο τέλος by default.
   */
  dashboard_cards: { key: string; visible: boolean }[];
  notify_pr: boolean;
  notify_session_reminder: boolean;
  /** ήχος + δόνηση στη λήξη του rest timer — στο γυμναστήριο δεν κοιτάς οθόνη */
  notify_rest_timer: boolean;
  /** ο rest timer ξεκινά μόνος του μόλις καταγραφεί σετ — ένα tap λιγότερο */
  auto_start_rest_timer: boolean;
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

/* ─────────── Δραστηριότητες οριζόμενες από τον χρήστη (v5) ─────────── */

/**
 * Ένα άθλημα/είδος προπόνησης. Τα 8 ενσωματωμένα υπάρχουν ως εγγραφές με
 * `is_builtin: true` ώστε να μπορείς να τα κρύψεις ή να τα μετονομάσεις —
 * και να προσθέσεις όσα δικά σου θέλεις.
 *
 * `uses_sets` καθορίζει ΤΙ βλέπεις στον logger: σετ/επαναλήψεις ή
 * χρόνος/απόσταση. Είναι ρύθμιση, όχι hardcoded if.
 */
export interface Activity {
  id: UUID;
  user_id: UUID | null;
  /** σταθερό key που γράφεται στο `workouts.activity_kind` */
  key: string;
  label: string;
  /** ελεύθερο emoji/σύμβολο — καμία λίστα εικονιδίων να διαλέξεις */
  icon: string;
  /** tailwind class για την κουκκίδα στο ημερολόγιο */
  dot_class: string;
  /** true = logger με σετ· false = χρόνος (+ απόσταση αν tracks_distance) */
  uses_sets: boolean;
  tracks_distance: boolean;
  is_builtin: boolean;
  display_order: number;
  is_archived: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
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
  /** v7: πόσες φορές/εβδομάδα στοχεύεις — null = χωρίς στόχο συχνότητας */
  target_sessions_per_week: number | null;
  is_archived: boolean;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
  deleted_at: ISOTimestamp | null;
}

export interface ProgramDay {
  id: UUID;
  program_id: UUID;
  /** π.χ. «Upper», «Push», «Πόδια» */
  name: string;
  position: number;
  created_at: ISOTimestamp;
  updated_at: ISOTimestamp;
}

/** Μια γραμμή του πλάνου: άσκηση + στόχοι. */
export interface ProgramExercise {
  id: UUID;
  program_id: UUID;
  /** v12: σε ποια μέρα του προγράμματος ανήκει (null = πρόγραμμα χωρίς ρητές μέρες) */
  program_day_id: UUID | null;
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
