import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { addSet, endWorkout, localDay, startWorkout } from '@/lib/db/queries';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { WorkoutDetailPage } from './WorkoutDetailPage';
import { ToastProvider } from '@/components/ui/toast';

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
      <ToastProvider>
        <MemoryRouter initialEntries={[`/history/${workoutId}`]}>
          <Routes>
            <Route path="/history/:workoutId" element={<WorkoutDetailPage />} />
            <Route path="/workout/active" element={<div>active</div>} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>
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

  it('undoes a set deletion from the toast', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: en.common.delete }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain(en.workout.setDeletedToast));
    await waitFor(async () => expect((await db.sets.get(s.id))!.deleted_at).not.toBeNull());

    fireEvent.click(screen.getByRole('button', { name: en.history.undo }));
    await waitFor(async () => expect((await db.sets.get(s.id))!.deleted_at).toBeNull());
    await waitFor(() => expect(screen.getByText(/80kg × 5/)).toBeTruthy());
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
    const textarea = await screen.findByRole(
      'textbox',
      { name: en.workout.pasteNotes },
      { timeout: 4000 },
    );
    fireEvent.change(textarea, {
      target: { value: 'W.pull ups: 30kg 5+4(drop set 10kg 7)' },
    });

    // Το parsing του paste γίνεται async· κάτω από παράλληλο φόρτο το default
    // 1s timeout είναι οριακό (flaky). Περιμένουμε ρητά το κουμπί αποθήκευσης.
    const saveBtn = await screen.findByRole(
      'button',
      { name: /Save 3 sets/i },
      { timeout: 4000 },
    );
    fireEvent.click(saveBtn);

    await waitFor(
      () => expect(screen.queryByRole('textbox', { name: en.workout.pasteNotes })).toBeNull(),
      { timeout: 4000 },
    );
    await waitFor(
      async () => {
        const liveSets = (await db.sets.where('workout_id').equals(w.id).toArray()).filter(
          (row) => row.deleted_at == null,
        );
        expect(liveSets).toHaveLength(4);
        expect(liveSets.some((row) => row.set_type === 'dropset' && row.weight_kg === 10)).toBe(true);
      },
      { timeout: 4000 },
    );
    // Το νέο link εμφανίζεται μόνο όταν το liveQuery ξαναδιαβάσει — findByRole
    // αντί για σύγχρονο getByRole ώστε να μην τρέχουμε πριν το re-render.
    expect(
      await screen.findByRole('link', { name: /Weighted Pull-ups/ }, { timeout: 4000 }),
    ).toBeTruthy();
  });

  it('removes a whole exercise (all its sets) after a confirm', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: en.workout.removeExercise }));
    const confirm = await screen.findByRole('dialog');
    fireEvent.click(within(confirm).getByRole('button', { name: en.common.delete }));

    await waitFor(async () => {
      const live = (await db.sets.where('workout_id').equals(w.id).toArray()).filter(
        (row) => row.deleted_at == null,
      );
      expect(live).toHaveLength(0);
    });
    await waitFor(() => expect(screen.queryByRole('link', { name: /Bench Press/ })).toBeNull());
  });

  it('starts a fresh active workout from the repeat button, preserving the name', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: en.history.repeatWorkout }));

    await waitFor(async () => {
      const active = (await db.workouts.toArray()).filter(
        (row) => row.deleted_at == null && row.ended_at == null && row.id !== w.id,
      );
      expect(active).toHaveLength(1);
      expect(active[0]!.workout_type).toBe('Upper');
    });
  });

  it('reorders exercises with the move-down button', async () => {
    const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
    const w = await startWorkout('strength', '2026-11-18', null, null, 'Legs');
    await addSet({
      workout_id: w.id,
      exercise_id: bench.id,
      weight_kg: 80,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await addSet({
      workout_id: w.id,
      exercise_id: squat.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });
    await endWorkout(w.id);

    const { getWorkoutDetail } = await import('@/lib/db/queries');
    let detail = await getWorkoutDetail(w.id);
    expect(detail!.exercises.map((e) => e.exerciseId)).toEqual([bench.id, squat.id]);

    renderDetail(w.id);
    await waitFor(() => expect(screen.getByRole('link', { name: /Bench Press/ })).toBeTruthy());
    fireEvent.click(screen.getAllByRole('button', { name: en.workout.moveDown })[0]!);

    await waitFor(async () => {
      detail = await getWorkoutDetail(w.id);
      expect(detail!.exercises.map((e) => e.exerciseId)).toEqual([squat.id, bench.id]);
    });
  });
});

describe('WorkoutDetailPage — batch weight, duplicate, date move', () => {
  it('αλλάζει βάρος σε όλα τα σετ μιας άσκησης με ένα κίνημα (batch)', async () => {
    const w = await startWorkout('strength', '2026-11-18', null, null, 'Upper');
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 85, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    renderDetail(w.id);
    await waitFor(() => expect(screen.getByRole('link', { name: /Bench Press/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: en.history.batchWeight }));
    const sheet = await screen.findByRole('dialog');
    const input = within(sheet).getByLabelText(en.history.batchWeightTitle) as HTMLInputElement;
    fireEvent.change(input, { target: { value: '-10' } });
    fireEvent.click(within(sheet).getByRole('button', { name: en.history.batchWeightApply }));

    await waitFor(async () => {
      const weights = (await db.sets.where('workout_id').equals(w.id).toArray())
        .map((s) => s.weight_kg)
        .sort((a, b) => (a ?? 0) - (b ?? 0));
      expect(weights).toEqual([70, 75]);
    });
  });

  it('αντιγράφει την προπόνηση σε άλλη ημερομηνία από το header', async () => {
    const w = await startWorkout('strength', '2026-11-15', null, null, 'Upper');
    await addSet({ workout_id: w.id, exercise_id: bench.id, weight_kg: 80, bodyweight_kg: null, reps: 5, hold_seconds: null });
    await endWorkout(w.id);

    renderDetail(w.id);
    await waitFor(() => expect(screen.getByRole('link', { name: /Bench Press/ })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: en.history.duplicateWorkout }));
    const sheet = await screen.findByRole('dialog');
    const dateInput = within(sheet).getByDisplayValue(localDay()) as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-11-08' } });
    fireEvent.click(within(sheet).getByRole('button', { name: en.history.duplicateAction }));

    await waitFor(async () => {
      const copies = (await db.workouts.toArray()).filter(
        (x) => x.id !== w.id && x.deleted_at == null && localDay(new Date(x.started_at)) === '2026-11-08',
      );
      expect(copies).toHaveLength(1);
      const copySets = await db.sets.where('workout_id').equals(copies[0]!.id).toArray();
      expect(copySets).toHaveLength(1);
    });
  });
});
