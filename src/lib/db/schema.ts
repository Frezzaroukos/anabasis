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

export const SCHEMA_VERSION = 1;

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
  }
}

export const db = new AnabasisDB();
