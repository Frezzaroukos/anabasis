/**
 * System-seeded data for Anabasis.
 *
 * IDs are stable UUIDs — they MUST stay constant across releases so that
 * sync between local Dexie and Supabase (Pro tier) doesn't double-insert.
 * If you need to retire a row, mark it `is_archived: true` — never reuse an id.
 */

import type { Exercise, Skill, SkillStep } from './types';

const NOW = '1970-01-01T00:00:00.000Z'; // overwritten on insert (see seedSystemData)

/* ─────────── Exercises (8 starters) ─────────── */

export const SEED_EXERCISES: Exercise[] = [
  {
    id: 'ex-00000000-0000-4000-8000-000000000001',
    user_id: null,
    name: 'Bench Press',
    category: 'push',
    movement_type: 'compound',
    equipment: ['barbell', 'bench'],
    is_weighted: true,
    is_bodyweight: false,
    default_unit: 'kg',
    notes: null,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  {
    id: 'ex-00000000-0000-4000-8000-000000000002',
    user_id: null,
    name: 'Incline Bench Press',
    category: 'push',
    movement_type: 'compound',
    equipment: ['barbell', 'bench'],
    is_weighted: true,
    is_bodyweight: false,
    default_unit: 'kg',
    notes: null,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  {
    id: 'ex-00000000-0000-4000-8000-000000000003',
    user_id: null,
    name: 'Overhead Press',
    category: 'push',
    movement_type: 'compound',
    equipment: ['barbell'],
    is_weighted: true,
    is_bodyweight: false,
    default_unit: 'kg',
    notes: null,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  {
    id: 'ex-00000000-0000-4000-8000-000000000004',
    user_id: null,
    name: 'Dips',
    category: 'push',
    movement_type: 'compound',
    equipment: ['parallel-bars'],
    is_weighted: true,
    is_bodyweight: true,
    default_unit: 'reps',
    notes: null,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  {
    id: 'ex-00000000-0000-4000-8000-000000000005',
    user_id: null,
    name: 'Pull-ups',
    category: 'pull',
    movement_type: 'compound',
    equipment: ['pull-up-bar'],
    is_weighted: true,
    is_bodyweight: true,
    default_unit: 'reps',
    notes: null,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  {
    id: 'ex-00000000-0000-4000-8000-000000000006',
    user_id: null,
    name: 'Biceps Curls',
    category: 'pull',
    movement_type: 'isolation',
    equipment: ['dumbbells'],
    is_weighted: true,
    is_bodyweight: false,
    default_unit: 'kg',
    notes: null,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  {
    id: 'ex-00000000-0000-4000-8000-000000000007',
    user_id: null,
    name: 'Back Squat',
    category: 'legs',
    movement_type: 'compound',
    equipment: ['barbell', 'rack'],
    is_weighted: true,
    is_bodyweight: false,
    default_unit: 'kg',
    notes: null,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
  {
    id: 'ex-00000000-0000-4000-8000-000000000008',
    user_id: null,
    name: 'Pistol Squat',
    category: 'legs',
    movement_type: 'compound',
    equipment: [],
    is_weighted: true,
    is_bodyweight: true,
    default_unit: 'reps',
    notes: null,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
    deleted_at: null,
  },
];

/* ─────────── Skills (8 starters) ─────────── */

const skillId = (n: number) =>
  `sk-00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const stepId = (skillN: number, stepN: number) =>
  `ss-${String(skillN).padStart(4, '0')}-0000-4000-8000-${String(stepN).padStart(12, '0')}`;

export const SEED_SKILLS: Skill[] = [
  {
    id: skillId(1),
    name: 'Muscle Up',
    short_code: 'Mu',
    category: 'pull',
    description:
      'Bar muscle-up: explosive pull-over from dead hang to support over the bar.',
    ultimate_goal: 'Strict bar muscle-up x1',
    difficulty: 3,
    display_order: 1,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: skillId(2),
    name: 'Front Lever',
    short_code: 'Fl',
    category: 'pull',
    description: 'Body held horizontal, face up, hanging from a bar.',
    ultimate_goal: 'Full front lever hold 5 seconds',
    difficulty: 4,
    display_order: 2,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: skillId(3),
    name: 'Back Lever',
    short_code: 'Bl',
    category: 'pull',
    description: 'Body held horizontal, face down, hanging from a bar.',
    ultimate_goal: 'Full back lever hold 5 seconds',
    difficulty: 3,
    display_order: 3,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: skillId(4),
    name: 'Planche',
    short_code: 'Pl',
    category: 'push',
    description:
      'Body held horizontal, face down, supported only by the hands on the floor.',
    ultimate_goal: 'Full planche hold 5 seconds',
    difficulty: 5,
    display_order: 4,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: skillId(5),
    name: 'Handstand',
    short_code: 'Hs',
    category: 'push',
    description: 'Freestanding inverted hold on the hands.',
    ultimate_goal: 'Freestanding handstand hold 60 seconds',
    difficulty: 3,
    display_order: 5,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: skillId(6),
    name: 'Human Flag',
    short_code: 'Hf',
    category: 'mixed',
    description: 'Side hold, body horizontal off a vertical pole.',
    ultimate_goal: 'Full human flag hold 5 seconds',
    difficulty: 5,
    display_order: 6,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: skillId(7),
    name: 'One Arm Chin-up',
    short_code: 'Oac',
    category: 'pull',
    description: 'Strict pull from dead hang to chin over bar on a single arm.',
    ultimate_goal: 'One arm chin-up x1',
    difficulty: 5,
    display_order: 7,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
  {
    id: skillId(8),
    name: 'V-Sit',
    short_code: 'Vs',
    category: 'core',
    description: 'Compression hold, hips lifted, legs angled high.',
    ultimate_goal: 'Full V-sit hold 5 seconds',
    difficulty: 4,
    display_order: 8,
    is_archived: false,
    created_at: NOW,
    updated_at: NOW,
  },
];

/* ─────────── Skill steps ─────────── */

interface StepDef {
  name: string;
  description: string;
  target_type: SkillStep['target_type'];
  target_value: number;
  target_unit: string;
}

const STEPS_BY_SKILL: Record<number, StepDef[]> = {
  1: [
    { name: 'Strict pull-up x10', description: 'Dead-hang full ROM', target_type: 'reps', target_value: 10, target_unit: 'reps' },
    { name: 'Straight-bar dip x10', description: 'Full lockout, controlled', target_type: 'reps', target_value: 10, target_unit: 'reps' },
    { name: 'High pull-up x5', description: 'Chest to bar, explosive', target_type: 'reps', target_value: 5, target_unit: 'reps' },
    { name: 'Banded muscle-up x3', description: 'Use light band assist', target_type: 'reps', target_value: 3, target_unit: 'reps' },
    { name: 'Strict bar muscle-up x1', description: 'No kip, full transition', target_type: 'reps', target_value: 1, target_unit: 'reps' },
  ],
  2: [
    { name: 'Tuck Front Lever', description: 'Knees to chest, back parallel', target_type: 'hold', target_value: 10, target_unit: 'sec' },
    { name: 'Advanced Tuck FL', description: 'Hips open, knees still tucked', target_type: 'hold', target_value: 10, target_unit: 'sec' },
    { name: 'Single-leg FL', description: 'One leg extended', target_type: 'hold', target_value: 8, target_unit: 'sec' },
    { name: 'Straddle Front Lever', description: 'Legs wide and straight', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Full Front Lever', description: 'Body parallel, legs together', target_type: 'hold', target_value: 5, target_unit: 'sec' },
  ],
  3: [
    { name: 'Tuck Back Lever', description: 'Knees to chest, body horizontal', target_type: 'hold', target_value: 10, target_unit: 'sec' },
    { name: 'Advanced Tuck BL', description: 'Open hips, knees tucked', target_type: 'hold', target_value: 10, target_unit: 'sec' },
    { name: 'Straddle Back Lever', description: 'Legs wide, straight body', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Full Back Lever', description: 'Body parallel, legs together', target_type: 'hold', target_value: 5, target_unit: 'sec' },
  ],
  4: [
    { name: 'Planche Lean', description: 'Forward lean push-up position', target_type: 'hold', target_value: 30, target_unit: 'sec' },
    { name: 'Tuck Planche', description: 'Knees on elbows', target_type: 'hold', target_value: 10, target_unit: 'sec' },
    { name: 'Advanced Tuck Planche', description: 'Hips open, back flat', target_type: 'hold', target_value: 10, target_unit: 'sec' },
    { name: 'Straddle Planche', description: 'Legs wide, hips extended', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Half-Lay Planche', description: 'Knees bent, body parallel', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Full Planche', description: 'Body parallel, legs together', target_type: 'hold', target_value: 5, target_unit: 'sec' },
  ],
  5: [
    { name: 'Wall Plank chest-to-wall', description: 'Belly facing wall, climb up', target_type: 'hold', target_value: 60, target_unit: 'sec' },
    { name: 'Wall Handstand back-to-wall', description: 'Kick into wall, hold straight', target_type: 'hold', target_value: 60, target_unit: 'sec' },
    { name: 'Freestanding kick-up', description: 'Find balance briefly', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Freestanding HS 30s', description: 'Sustained balance', target_type: 'hold', target_value: 30, target_unit: 'sec' },
    { name: 'Freestanding HS 60s', description: 'Mastery hold', target_type: 'hold', target_value: 60, target_unit: 'sec' },
  ],
  6: [
    { name: 'Vertical Flag', description: 'Legs up against pole', target_type: 'hold', target_value: 10, target_unit: 'sec' },
    { name: 'Tuck Flag', description: 'Knees tucked to chest, side hold', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Single-Leg Flag', description: 'One leg extended', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Straddle Flag', description: 'Legs wide, body horizontal', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Full Human Flag', description: 'Body & legs straight', target_type: 'hold', target_value: 5, target_unit: 'sec' },
  ],
  7: [
    { name: 'Pull-ups x15', description: 'Strict, full ROM', target_type: 'reps', target_value: 15, target_unit: 'reps' },
    { name: 'Weighted pull-up +30kg x5', description: 'Added belt weight', target_type: 'reps', target_value: 5, target_unit: 'reps' },
    { name: 'Archer pull-up x5', description: 'Pull side-to-side', target_type: 'reps', target_value: 5, target_unit: 'reps' },
    { name: 'One-arm negative', description: 'Slow lower from top, 5s', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'One-arm chin-up x1', description: 'Strict, no body english', target_type: 'reps', target_value: 1, target_unit: 'reps' },
  ],
  8: [
    { name: 'Tuck L-sit', description: 'Knees to chest, hips off floor', target_type: 'hold', target_value: 15, target_unit: 'sec' },
    { name: 'Full L-sit', description: 'Legs straight, parallel to floor', target_type: 'hold', target_value: 15, target_unit: 'sec' },
    { name: 'Advanced Tuck V-sit', description: 'Knees tucked, legs angled up', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Straddle V-sit', description: 'Legs wide, raised high', target_type: 'hold', target_value: 5, target_unit: 'sec' },
    { name: 'Full V-sit', description: 'Legs together, raised high', target_type: 'hold', target_value: 5, target_unit: 'sec' },
  ],
};

export const SEED_SKILL_STEPS: SkillStep[] = SEED_SKILLS.flatMap((skill, i) => {
  const skillN = i + 1;
  const defs = STEPS_BY_SKILL[skillN] ?? [];
  return defs.map((def, idx) => {
    const stepNumber = idx + 1;
    const prevId = idx === 0 ? null : stepId(skillN, idx);
    return {
      id: stepId(skillN, stepNumber),
      skill_id: skill.id,
      step_number: stepNumber,
      name: def.name,
      description: def.description,
      target_type: def.target_type,
      target_value: def.target_value,
      target_unit: def.target_unit,
      benchmark_video_url: null,
      prerequisites: prevId ? [prevId] : [],
      created_at: NOW,
      updated_at: NOW,
    };
  });
});
