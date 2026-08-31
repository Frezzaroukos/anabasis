import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { createProgram, endWorkout, setProgramTarget, startWorkoutFromProgram } from '@/lib/db/queries';
import type { GoalProgress } from '@/lib/db/goals';
import type { Goal } from '@/lib/db/types';
import { GoalRow } from './GoalRow';

/**
 * Οι μεταφράσεις `goals.viewProgress` / `goals.achieved` είναι νέα κλειδιά
 * (§ report) που δεν υπάρχουν ακόμα στο en.json — δεν αγγίζουμε i18n json
 * (iron rule), οπότε το test instance παίρνει ΤΟΠΙΚΟ resource bundle με το
 * προτεινόμενο κείμενο, χωρίς να πειράξει το πραγματικό αρχείο.
 */
beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: {
        en: {
          translation: {
            ...en,
            goals: {
              ...en.goals,
              viewProgress: 'View progress',
              achieved: 'Achieved',
            },
          },
        },
      },
      interpolation: { escapeValue: false },
    });
  }
});

beforeEach(async () => {
  setCurrentUserId('goal-row-test-profile');
  await db.programs.clear();
  await db.workouts.clear();
});

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  const t = new Date().toISOString();
  return {
    id: 'goal-1',
    user_id: 'goal-row-test-profile',
    label: null,
    metric: 'sessions',
    target: 4,
    period: 'week',
    period_anchor: 'calendar',
    activity_key: null,
    exercise_id: null,
    display_order: 0,
    is_archived: false,
    created_at: t,
    updated_at: t,
    deleted_at: null,
    ...overrides,
  };
}

function makeProgress(
  goalOverrides: Partial<Goal> = {},
  progressOverrides: Partial<GoalProgress> = {},
): GoalProgress {
  const goal = makeGoal(goalOverrides);
  return {
    goal,
    current: 2,
    target: goal.target,
    ratio: 0.5,
    unit: '',
    daysLeft: 3,
    ...progressOverrides,
  };
}

const renderRow = (progress: GoalProgress) =>
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <GoalRow
          progress={progress}
          index={0}
          total={1}
          activityLabel={() => null}
          exerciseName={() => null}
          skillName={() => null}
          onMove={() => {}}
          onEdit={() => {}}
          onDelete={() => {}}
        />
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('GoalRow — exercise deep-link', () => {
  it('δείχνει σύνδεσμο προς το chart της άσκησης όταν ο στόχος έχει exercise_id', () => {
    const progress = makeProgress({ metric: 'reps', exercise_id: 'ex-pullup' });
    renderRow(progress);
    const link = screen.getByRole('link', { name: /View progress/ });
    expect(link.getAttribute('href')).toBe('/progress?exerciseId=ex-pullup');
  });

  it('ΔΕΝ δείχνει σύνδεσμο όταν ο στόχος δεν αφορά συγκεκριμένη άσκηση', () => {
    const progress = makeProgress({ metric: 'sessions', exercise_id: null });
    renderRow(progress);
    expect(screen.queryByRole('link', { name: /View progress/ })).toBeNull();
  });
});

describe('GoalRow — ολοκληρωμένος στόχος', () => {
  it('δείχνει το "achieved" badge όταν ratio >= 1', () => {
    const progress = makeProgress({}, { ratio: 1, current: 4 });
    renderRow(progress);
    expect(screen.getByText('Achieved')).toBeTruthy();
  });

  it('ΔΕΝ δείχνει το badge πριν την επίτευξη', () => {
    const progress = makeProgress({}, { ratio: 0.5, current: 2 });
    renderRow(progress);
    expect(screen.queryByText('Achieved')).toBeNull();
  });
});

describe('GoalRow — σύνδεση με program adherence', () => {
  it('δείχνει το πρόγραμμα με weekly target όταν ο στόχος είναι sessions/week', async () => {
    const program = await createProgram('Push Day', 'strength');
    await setProgramTarget(program.id, 3);
    const started = await startWorkoutFromProgram(program.id);
    await endWorkout(started!.workout.id);

    const progress = makeProgress({ metric: 'sessions', period: 'week', activity_key: null });
    renderRow(progress);

    const link = await screen.findByRole('link', { name: /Push Day/ });
    expect(link.getAttribute('href')).toBe(`/programs/${program.id}`);
    expect(link.textContent).toContain('1/3');
  });

  it('ΔΕΝ δείχνει σύνδεσμο για μη-συχνότητα στόχο (π.χ. μηνιαίος όγκος)', async () => {
    const program = await createProgram('Push Day', 'strength');
    await setProgramTarget(program.id, 3);

    const progress = makeProgress({ metric: 'volume_kg', period: 'month' });
    renderRow(progress);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Push Day/ })).toBeNull();
    });
  });

  it('ΔΕΝ ταιριάζει πρόγραμμα άλλου αθλήματος από τον στόχο', async () => {
    const program = await createProgram('Swim Block', 'swimming');
    await setProgramTarget(program.id, 3);

    const progress = makeProgress({ metric: 'sessions', period: 'week', activity_key: 'strength' });
    renderRow(progress);

    await waitFor(() => {
      expect(screen.queryByRole('link', { name: /Swim Block/ })).toBeNull();
    });
  });
});
