import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { addSet, endWorkout, startWorkout } from '@/lib/db/queries';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { WorkoutDetailPage } from './WorkoutDetailPage';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

beforeEach(async () => {
  setCurrentUserId('workout-detail-test');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

const bench = SEED_EXERCISES.find((e) => e.name === 'Bench Press')!;

function renderDetail(workoutId: string) {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={[`/history/${workoutId}`]}>
        <Routes>
          <Route path="/history/:workoutId" element={<WorkoutDetailPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('WorkoutDetailPage — inline set & exercise management on past workouts', () => {
  it('edits an existing set (including half reps and notes), duplicates a set, and deletes a set inline', async () => {
    const w = await startWorkout('strength', '2026-11-18', null, null, 'Upper');
    const s = await addSet({
      workout_id: w.id,
      exercise_id: bench.id,
      weight_kg: 80,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await endWorkout(w.id);

    renderDetail(w.id);

    await waitFor(() => expect(screen.getByRole('link', { name: /Bench Press/ })).toBeTruthy());
    expect(screen.getByText(/80kg × 5/)).toBeTruthy();

    // 1. Edit set inline (update reps to 2.5 + add note)
    fireEvent.click(screen.getByRole('button', { name: en.common.edit }));
    fireEvent.change(screen.getByLabelText(en.workout.reps), { target: { value: '2.5' } });
    fireEvent.click(screen.getByRole('button', { name: en.workout.intensityShow }));
    fireEvent.change(screen.getByLabelText(en.workout.setNote), { target: { value: 'paused' } });
    fireEvent.click(screen.getByRole('button', { name: en.workout.save }));

    await waitFor(async () => {
      const updated = await db.sets.get(s.id);
      expect(updated?.reps).toBe(2.5);
      expect(updated?.notes).toBe('paused');
    });

    await waitFor(() => expect(screen.getByText('paused')).toBeTruthy());

    // 2. Duplicate set inline (+1)
    fireEvent.click(screen.getByRole('button', { name: en.workout.duplicateSet }));
    await waitFor(async () => {
      const live = (await db.sets.where('workout_id').equals(w.id).toArray()).filter(
        (row) => row.deleted_at == null,
      );
      expect(live).toHaveLength(2);
    });

    // 3. Delete one set inline
    const deleteBtns = screen.getAllByRole('button', { name: en.common.delete });
    fireEvent.click(deleteBtns[deleteBtns.length - 1]!);
    await waitFor(async () => {
      const live = (await db.sets.where('workout_id').equals(w.id).toArray()).filter(
        (row) => row.deleted_at == null,
      );
      expect(live).toHaveLength(1);
    });
  });

  it('appends new exercises & sets via Paste notes directly into a past workout', async () => {
    const w = await startWorkout('strength', '2026-11-18', null, null, 'Upper');
    await addSet({
      workout_id: w.id,
      exercise_id: bench.id,
      weight_kg: 80,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await endWorkout(w.id);

    renderDetail(w.id);
    await waitFor(() => expect(screen.getByRole('link', { name: /Bench Press/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: en.workout.pasteNotes }));
    const textarea = await screen.findByRole('textbox', { name: en.workout.pasteNotes });
    fireEvent.change(textarea, {
      target: { value: 'W.pull ups: 30kg 5+4(drop set 10kg 7)' },
    });

    const saveBtn = await screen.findByRole('button', { name: /Save 3 sets/i });
    fireEvent.click(saveBtn);

    await waitFor(() =>
      expect(screen.queryByRole('textbox', { name: en.workout.pasteNotes })).toBeNull(),
    );
    await waitFor(async () => {
      const liveSets = (await db.sets.where('workout_id').equals(w.id).toArray()).filter(
        (row) => row.deleted_at == null,
      );
      expect(liveSets).toHaveLength(4);
      expect(liveSets.some((row) => row.set_type === 'dropset' && row.weight_kg === 10)).toBe(true);
    });
    expect(screen.getByRole('link', { name: /Weighted Pull-ups/ })).toBeTruthy();
  });
});
