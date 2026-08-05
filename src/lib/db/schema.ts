/**
 * Dexie schema for Anabasis.
 * Indexes mirror DATABASE_SCHEMA.md "Indexes" section.
 *
 * Schema versioning: bump the number in `db.version(N).stores({...})`
 * AND add a matching entry in migrations.ts when fields/indexes change.
 */

import Dexie, { type Table } from 'dexie';
import type {
  Activity,
  AppSettings,
  BodyMetric,
  Program,
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
  Workout,
} from './types';

export const SCHEMA_VERSION = 7;

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
  program_exercises!: Table<ProgramExercise, string>;
  activities!: Table<Activity, string>;
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
  }
}

export const db = new AnabasisDB();
