/**
 * Dexie schema for Anabasis.
 * Indexes mirror DATABASE_SCHEMA.md "Indexes" section.
 *
 * Schema versioning: bump the number in `db.version(N).stores({...})`
 * AND add a matching entry in migrations.ts when fields/indexes change.
 */

import Dexie, { type Table } from 'dexie';
import type {
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

export const SCHEMA_VERSION = 3;

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
  }
}

export const db = new AnabasisDB();
