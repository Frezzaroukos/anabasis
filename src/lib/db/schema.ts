/**
 * Dexie schema for Anabasis.
 * Indexes mirror DATABASE_SCHEMA.md "Indexes" section.
 *
 * Schema versioning: bump SCHEMA_VERSION και πρόσθεσε ένα `this.version(N)`
 * block με το .upgrade() του — όλη η migration λογική ζει ΕΔΩ, ώστε να
 * τρέχει αυτόματα από το Dexie όταν ανοίγει παλιά βάση.
 */

import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  AppSettings,
  BodyMetric,
  Program,
  ProgramDay,
  ProgramExercise,
  Exercise,
  OutgoingEvent,
  PersonalRecord,
  SetEntry,
  Skill,
  SkillStep,
  User,
  UserSkillProgress,
  UserSkillStepCompletion,
  Goal,
  Workout,
} from './types';

export const SCHEMA_VERSION = 12;

export class AnabasisDB extends Dexie {
  users!: Table<User, string>;
  exercises!: Table<Exercise, string>;
  workouts!: Table<Workout, string>;
  sets!: Table<SetEntry, string>;
  personal_records!: Table<PersonalRecord, string>;
  skills!: Table<Skill, string>;
  skill_steps!: Table<SkillStep, string>;
  user_skill_progress!: Table<UserSkillProgress, string>;
  user_skill_step_completions!: Table<UserSkillStepCompletion, string>;
  app_settings!: Table<AppSettings, string>;
  body_metrics!: Table<BodyMetric, string>;
  programs!: Table<Program, string>;
  program_days!: Table<ProgramDay, string>;
  program_exercises!: Table<ProgramExercise, string>;
  activities!: Table<Activity, string>;
  goals!: Table<Goal, string>;
  events_outgoing!: Table<OutgoingEvent, string>;

  constructor() {
    super('anabasis');

    this.version(1).stores({
      users: 'id, email, updated_at',
      exercises:
        'id, user_id, name, category, movement_type, is_archived, deleted_at, [user_id+category]',
      workouts:
        'id, user_id, started_at, ended_at, deleted_at, [user_id+started_at]',
      sets:
        'id, workout_id, exercise_id, set_number, deleted_at, [exercise_id+created_at], [workout_id+set_number]',
      personal_records:
        'id, user_id, exercise_id, type, achieved_at, [user_id+exercise_id+type]',
      skills: 'id, short_code, category, display_order, is_archived',
      skill_steps: 'id, skill_id, step_number, [skill_id+step_number]',
      user_skill_progress:
        'id, user_id, skill_id, status, &[user_id+skill_id]',
      user_skill_step_completions:
        'id, user_id, skill_step_id, achieved_at, workout_id',
      app_settings: 'id, &user_id',
      events_outgoing:
        'id, user_id, event_type, target_app, delivered_at, emitted_at',
    });

    /**
     * v2 — πολλαπλές δραστηριότητες/μέρα (γυμναστήριο + μπάσκετ + τρέξιμο),
     * τύποι σετ (dropset/superset/rest-pause) και μετρήσεις σώματος.
     *
     * Το upgrade συμπληρώνει ΜΟΝΟ τα νέα πεδία σε υπάρχουσες εγγραφές —
     * καμία διαγραφή, κανένα rewrite δεδομένων.
     */
    this.version(2)
      .stores({
        workouts:
          'id, user_id, started_at, ended_at, activity_kind, deleted_at, [user_id+started_at]',
        sets:
          'id, workout_id, exercise_id, set_number, set_type, group_id, deleted_at, [exercise_id+created_at], [workout_id+set_number]',
        body_metrics: 'id, user_id, date, &[user_id+date]',
      })
      .upgrade(async (tx) => {
        await tx
          .table('workouts')
          .toCollection()
          .modify((w) => {
            w.activity_kind ??= 'strength';
            w.distance_km ??= null;
          });
        await tx
          .table('sets')
          .toCollection()
          .modify((s) => {
            s.set_type ??= s.is_warmup ? 'warmup' : s.is_failure ? 'failure' : 'normal';
            s.group_id ??= null;
          });
      });

    /** v3 — αποθηκευμένα προγράμματα/ρουτίνες. Μόνο νέοι πίνακες, μηδέν migration. */
    this.version(3).stores({
      programs: 'id, user_id, name, activity_kind, display_order, is_archived, deleted_at',
      program_exercises: 'id, program_id, exercise_id, position, [program_id+position]',
    });

    /**
     * v4 — ειδοποίηση rest timer. Καμία αλλαγή σε index· μόνο backfill ώστε
     * το πεδίο να μην είναι undefined σε υπάρχουσες εγκαταστάσεις.
     */
    this.version(4).upgrade(async (tx) => {
      await tx
        .table('app_settings')
        .toCollection()
        .modify((s) => {
          s.notify_rest_timer ??= true;
        });
    });

    /**
     * v5 — «ξεκλείδωμα»: δικές σου δραστηριότητες αντί για 8 σταθερές, και
     * RIR/tempo δίπλα στο RPE. Οι κατηγορίες ασκήσεων/skills έγιναν ελεύθερα
     * strings σε επίπεδο τύπων — δεν χρειάζονται migration, τα υπάρχοντα
     * δεδομένα είναι ήδη έγκυρα.
     */
    this.version(5)
      .stores({
        activities: 'id, user_id, &key, display_order, is_archived, is_builtin',
      })
      .upgrade(async (tx) => {
        await tx
          .table('sets')
          .toCollection()
          .modify((s) => {
            s.rir ??= null;
            s.tempo ??= null;
          });
      });

    /**
     * v6 — πολλαπλά προφίλ στην ίδια συσκευή. Τα skills αποκτούν ιδιοκτήτη
     * ώστε ένα δικό σου tree να μη φαίνεται στο προφίλ του διπλανού· τα
     * seeded μένουν `null` (κοινά σε όλους).
     */
    this.version(6)
      .stores({
        skills: 'id, user_id, short_code, category, display_order, is_archived',
      })
      .upgrade(async (tx) => {
        await tx
          .table('skills')
          .toCollection()
          .modify((s) => {
            s.user_id ??= null;
          });
      });

    /**
     * v7 — ενιαίο PR σύστημα (strength + δραστηριότητες χωρίς σετ), εύκολο
     * workout building, macros, στόχος συχνότητας. Το `personal_records`
     * αποκτά `activity_kind` index ώστε ένα PR τρεξίματος να αναζητείται
     * χωρίς exercise_id — τα strength PRs κρατούν το παλιό τους μονοπάτι.
     */
    this.version(7)
      .stores({
        personal_records:
          'id, user_id, exercise_id, activity_kind, type, achieved_at, [user_id+exercise_id+type], [user_id+activity_kind+type]',
      })
      .upgrade(async (tx) => {
        await tx
          .table('personal_records')
          .toCollection()
          .modify((r) => {
            r.activity_kind ??= null;
          });
        await tx
          .table('programs')
          .toCollection()
          .modify((p) => {
            p.target_sessions_per_week ??= null;
          });
        await tx
          .table('body_metrics')
          .toCollection()
          .modify((m) => {
            m.carbs_g ??= null;
            m.fat_g ??= null;
          });
      });

    /**
     * v8 — στόχοι στα μέτρα του χρήστη + διάταξη Αρχικής.
     *
     * Ο πίνακας `goals` αντικαθιστά την ιδέα ενός σταθερού «εβδομαδιαίου
     * στόχου όγκου»: κάθε χρήστης ορίζει μέτρο/ποσό/περίοδο/εύρος. Δεν
     * δημιουργούμε προεπιλεγμένους στόχους στο upgrade — ένας στόχος που
     * δεν έβαλε ο χρήστης είναι ψεύτικο δεδομένο, και ο δακτύλιος θα έδειχνε
     * πρόοδο προς κάτι που κανείς δεν ζήτησε.
     *
     * Το `dashboard_cards` μπαίνει ως κενός πίνακας = «καμία προτίμηση»· η
     * Αρχική πέφτει τότε στην προεπιλεγμένη σειρά.
     */
    this.version(8)
      .stores({
        goals:
          'id, user_id, metric, period, activity_key, exercise_id, display_order, is_archived, deleted_at, [user_id+is_archived]',
      })
      .upgrade(async (tx) => {
        await tx
          .table('app_settings')
          .toCollection()
          .modify((s) => {
            s.dashboard_cards ??= [];
          });
      });

    /**
     * v9 — ημερολογιακή vs κυλιόμενη περίοδος στόχου.
     *
     * Οι υπάρχοντες στόχοι γίνονται ρητά `rolling`, γιατί έτσι μετρούσαν ήδη:
     * ένα backfill σε `calendar` θα άλλαζε σιωπηλά το νόημα ενός στόχου που
     * ο χρήστης είχε ήδη ορίσει, και θα «πετούσε» πρόοδο κάθε Δευτέρα χωρίς
     * να το ζητήσει κανείς. Οι ΝΕΟΙ στόχοι ξεκινούν ως `calendar` (βλ.
     * createGoal) επειδή έτσι σκέφτεται ο περισσότερος κόσμος.
     */
    this.version(9).upgrade(async (tx) => {
      await tx
        .table('goals')
        .toCollection()
        .modify((g) => {
          g.period_anchor ??= 'rolling';
        });
    });

    /**
     * v10 — auto-start του rest timer μετά από κάθε σετ (default: ναι).
     * Ίδιο pattern με το v4 notify_rest_timer: additive πεδίο σε app_settings,
     * ??= ώστε ένα μελλοντικό opt-out να μην ξαναγυρίσει ποτέ σε true.
     * (Το sets.hold_seconds ΔΕΝ θέλει version block: μη-indexed πεδίο,
     * το Dexie δεν απαιτεί δήλωση και δεν υπάρχει backfill.)
     */
    this.version(10).upgrade(async (tx) => {
      await tx
        .table('app_settings')
        .toCollection()
        .modify((s) => {
          s.auto_start_rest_timer ??= true;
        });
    });

    /*
     * v11 — χειροκίνητα βήματα στο body_metrics (steps). Μη-indexed πεδίο,
     * οπότε δεν χρειάζεται δήλωση stores· κρατάμε το version block για συνέπεια
     * και για να «κλειδώσει» το SCHEMA_VERSION=11. Οι θερμίδες/μακρο ΜΕΝΟΥΝ ως
     * στήλες (καμία καταστροφική migration) αλλά βγαίνουν από το UI — το φαγητό
     * το χειρίζεται ξεχωριστό app.
     */
    this.version(11).upgrade(async () => {
      // no-op backfill· τα νέα records παίρνουν steps από τον κώδικα (?? null)
    });

    /**
     * v12 — Calendar-centric restructure (docs/ARCHITECTURE-V4.md):
     *  · νέος πίνακας `program_days` — ένα πρόγραμμα έχει πολλές μέρες (Upper/Lower…)
     *  · `program_exercises.program_day_id` — ανήκει σε μέρα (null = single implicit day)
     *  · `workouts.program_id` + `program_day_id` — link για auto-numbering («3η Upper day»)·
     *    ad-hoc προπόνηση = και τα δύο null.
     * Additive/μη-καταστροφικό: υπάρχοντα rows παίρνουν null (single-day/ad-hoc).
     * Το program_day_id δηλώνεται ως index γιατί ερωτάμε workouts/exercises ανά μέρα.
     */
    this.version(12)
      .stores({
        program_days: 'id, program_id, position, [program_id+position]',
        program_exercises:
          'id, program_id, program_day_id, exercise_id, position, [program_id+position], [program_day_id+position]',
        workouts:
          'id, user_id, started_at, ended_at, activity_kind, program_id, program_day_id, deleted_at, [user_id+started_at]',
      })
      .upgrade(async (tx) => {
        await tx.table('program_exercises').toCollection().modify((pe) => {
          pe.program_day_id ??= null;
        });
        await tx.table('workouts').toCollection().modify((w) => {
          w.program_id ??= null;
          w.program_day_id ??= null;
        });
      });
  }
}

export const db = new AnabasisDB();
