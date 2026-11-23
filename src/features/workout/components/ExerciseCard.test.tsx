import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ExerciseCard } from './ExerciseCard';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { startWorkout } from '@/lib/db/queries';
import { addSet, endWorkout } from '@/lib/db/queries';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { __resetRestTimer, remainingSeconds } from '../restTimer';
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
  setCurrentUserId('exercise-card-profile');
  await db.exercises.clear();
  await db.exercises.bulkPut(SEED_EXERCISES);
  await db.workouts.clear();
  await db.sets.clear();
});

const wrap = (ui: React.ReactNode) => <I18nextProvider i18n={i18next}>{ui}</I18nextProvider>;

const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;

/**
 * Η φόρμα καταγραφής σετ ΔΕΝ πρέπει να κλείνει μετά το save (owner: ήρεμη,
 * γρήγορη καταγραφή σετ-σετ) — χωρίς dominant timer, με το βάρος να μένει
 * ίδιο ανάμεσα σε σετ, μόνο τα reps καθαρίζουν, και refocus στο reps.
 */
describe('ExerciseCard — set-by-set logging stays calm', () => {
  it('μετά το save η φόρμα μένει ανοιχτή: κρατάει βάρος ΚΑΙ reps (1 tap/σετ), refocus', async () => {
    const workout = await startWorkout('strength');

    render(
      wrap(
        <ExerciseCard
          exercise={squat}
          workoutId={workout.id}
          sets={[]}
          bodyweightKg={null}
          weighted
          onWeightedChange={vi.fn()}
          chain={null}
          onChainChange={vi.fn()}
        />,
      ),
    );

    const weightInput = screen.getByLabelText('Weight (kg)');
    const repsInput = screen.getByLabelText('Reps');

    fireEvent.change(weightInput, { target: { value: '100' } });
    fireEvent.change(repsInput, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add set' }));

    await waitFor(async () => {
      const sets = await db.sets.where('workout_id').equals(workout.id).toArray();
      expect(sets).toHaveLength(1);
    });

    // Η φόρμα ΔΕΝ έκλεισε — τα inputs είναι ακόμα εκεί (όχι το "+ Add set" κουμπί).
    expect(screen.getByLabelText('Weight (kg)')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Add set' })).toBeTruthy();

    // Βάρος και reps μένουν, focus πάει πίσω στα reps.
    await waitFor(() => {
      expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('100');
      expect((screen.getByLabelText('Reps') as HTMLInputElement).value).toBe('5');
      expect(document.activeElement).toBe(screen.getByLabelText('Reps'));
    });
  });

  it('announces a new PR through a polite live region carrying the gold-strong text', async () => {
    // Ιστορικό ώστε το επόμενο βαρύτερο σετ να «σπάσει» ρεκόρ (πρώτο σετ ποτέ
    // δεν είναι PR).
    const prior = await startWorkout('strength');
    await addSet({
      workout_id: prior.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 5, hold_seconds: null,
    });
    await endWorkout(prior.id);

    const workout = await startWorkout('strength');
    render(
      wrap(
        <ExerciseCard
          exercise={squat}
          workoutId={workout.id}
          sets={[]}
          bodyweightKg={null}
          weighted
          onWeightedChange={vi.fn()}
          chain={null}
          onChainChange={vi.fn()}
        />,
      ),
    );

    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '120' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add set' }));

    const status = await screen.findByRole('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
    expect(status.className).toContain('text-gold-strong');
  });
});

describe('ExerciseCard — entry friction', () => {
  const renderCard = (workoutId: string, sets: Parameters<typeof ExerciseCard>[0]['sets'] = []) =>
    render(
      wrap(
        <ToastProvider>
        <ExerciseCard
          exercise={squat}
          workoutId={workoutId}
          sets={sets}
          bodyweightKg={null}
          weighted
          onWeightedChange={vi.fn()}
          chain={null}
          onChainChange={vi.fn()}
        />
        </ToastProvider>,
      ),
    );

  it('προ-συμπληρώνει weight+reps από το προηγούμενο σετ της ίδιας προπόνησης', async () => {
    const workout = await startWorkout('strength');
    await addSet({ workout_id: workout.id, exercise_id: squat.id, weight_kg: 60, bodyweight_kg: null, reps: 8, hold_seconds: null });
    const sets = await db.sets.where('workout_id').equals(workout.id).toArray();
    renderCard(workout.id, sets);
    fireEvent.click(screen.getByRole('button', { name: /Add set/ }));
    expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('60');
    expect((screen.getByLabelText('Reps') as HTMLInputElement).value).toBe('8');
  });

  it('ένα σύντομο τικ δόνησης σε κάθε σετ που γράφεται (όπου υπάρχει Vibration API)', async () => {
    const vibrate = vi.fn(() => true);
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    try {
      const workout = await startWorkout('strength');
      renderCard(workout.id);
      fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '60' } });
      fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '5' } });
      fireEvent.click(screen.getByRole('button', { name: 'Add set' }));
      await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(1));
      // Ίδιο σετ ξανά: όχι ρεκόρ → απλό τικ.
      await waitFor(() => expect(screen.getByRole('button', { name: 'Add set' })).toHaveProperty('disabled', false));
      fireEvent.click(screen.getByRole('button', { name: 'Add set' }));
      await waitFor(() => expect(vibrate).toHaveBeenCalledTimes(2));
      expect(vibrate).toHaveBeenLastCalledWith(12);
    } finally {
      Reflect.deleteProperty(navigator, 'vibrate');
    }
  });

  it('drop set προ-συμπληρώνει ~80% του προηγούμενου βάρους', async () => {
    const workout = await startWorkout('strength');
    await addSet({ workout_id: workout.id, exercise_id: squat.id, weight_kg: 100, bodyweight_kg: null, reps: 8, hold_seconds: null });
    const sets = await db.sets.where('workout_id').equals(workout.id).toArray();
    renderCard(workout.id, sets);
    fireEvent.click(screen.getByRole('button', { name: en.workout.addDropSet }));
    await waitFor(() => {
      expect((screen.getByLabelText('Weight (kg)') as HTMLInputElement).value).toBe('80');
    });
  });

  const putSettings = async (auto: boolean, enabled: boolean | null = true) => {
    await db.app_settings.clear();
    await db.app_settings.put({
      id: 's1', user_id: 'exercise-card-profile', default_rest_timer_seconds: 90, notify_pr: true,
      notify_session_reminder: false, notify_rest_timer: true, auto_start_rest_timer: auto, rest_timer_enabled: enabled ?? undefined, reminder_time: null,
      reminder_days: [], show_e1rm: true, weight_unit: 'kg', theme: 'dark', dashboard_cards: [],
      coach_enabled: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    } as never);
  };

  it('ξεκινά αυτόματα rest timer μετά το save όταν η ρύθμιση είναι ON', async () => {
    __resetRestTimer();
    await putSettings(true);
    const workout = await startWorkout('strength');
    renderCard(workout.id);
    await waitFor(() => expect(screen.getByLabelText('Weight (kg)')).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '8' } });
    await new Promise((r) => setTimeout(r, 50)); // settings liveQuery
    fireEvent.click(screen.getByRole('button', { name: 'Add set' }));
    await waitFor(() => expect(remainingSeconds()).toBeGreaterThan(80));
    __resetRestTimer();
  });

  it('ΚΛΕΙΣΤΟ εξ ορισμού (owner 820c2d5): auto_start=true χωρίς rest_timer_enabled → κανένα timer', async () => {
    __resetRestTimer();
    // Παλιός χρήστης: αποθηκευμένο auto_start=true, ο νέος κύριος διακόπτης λείπει.
    await putSettings(true, null);
    const workout = await startWorkout('strength');
    renderCard(workout.id);
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '8' } });
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(screen.getByRole('button', { name: 'Add set' }));
    await waitFor(async () => expect(await db.sets.where('workout_id').equals(workout.id).count()).toBe(1));
    expect(remainingSeconds()).toBe(0);
  });

  it('ΔΕΝ ξεκινά rest timer όταν η ρύθμιση είναι OFF', async () => {
    __resetRestTimer();
    await putSettings(false);
    const workout = await startWorkout('strength');
    renderCard(workout.id);
    fireEvent.change(screen.getByLabelText('Weight (kg)'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Reps'), { target: { value: '8' } });
    await new Promise((r) => setTimeout(r, 50));
    fireEvent.click(screen.getByRole('button', { name: 'Add set' }));
    await waitFor(async () => expect(await db.sets.where('workout_id').equals(workout.id).count()).toBe(1));
    expect(remainingSeconds()).toBe(0);
  });
});
