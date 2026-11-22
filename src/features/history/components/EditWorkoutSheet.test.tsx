import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { EditWorkoutSheet } from './EditWorkoutSheet';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { endWorkout, getWorkoutDetail, startWorkout } from '@/lib/db/queries';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Διόρθωση ΟΛΟΚΛΗΡΩΜΕΝΗΣ δραστηριότητας (run/cycle/…): απόσταση km + διάρκεια
 * h:mm:ss + ζωντανό pace, με PR recompute μετά το save.
 */
const UID = 'a2-activity-profile';

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
  setCurrentUserId(UID);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

async function runWorkout(distanceKm: number, durationSeconds: number) {
  const w = await startWorkout('run', '2026-11-18');
  // Ολοκλήρωσε με απόσταση/διάρκεια μέσω των query helpers (όπως η ροή).
  const { updateWorkoutDistance } = await import('@/lib/db/queries');
  await updateWorkoutDistance(w.id, distanceKm);
  await endWorkout(w.id, durationSeconds);
  return (await db.workouts.get(w.id))!;
}

function renderSheet(workoutId: string, onClose = () => {}) {
  return db.workouts.get(workoutId).then((workout) =>
    render(
      <I18nextProvider i18n={i18next}>
        <ToastProvider>
          <MemoryRouter>
            <EditWorkoutSheet open onClose={onClose} workout={workout!} />
          </MemoryRouter>
        </ToastProvider>
      </I18nextProvider>,
    ),
  );
}

describe('EditWorkoutSheet — δραστηριότητα (run)', () => {
  it('αλλάζει 5→5,5 km και 25:00→26:30, δείχνει σωστό pace και recompute PR', async () => {
    const w = await runWorkout(5, 25 * 60);
    // Αρχικό PR longest_distance=5, longest_duration=1500.
    const beforePrs = await db.personal_records.toArray();
    expect(beforePrs.some((r) => r.type === 'longest_distance' && r.value === 5)).toBe(true);

    await renderSheet(w.id);
    // Τα πεδία είναι προ-γεμισμένα από το workout.
    const distance = screen.getByLabelText(en.workout.distanceKm) as HTMLInputElement;
    const duration = screen.getByLabelText(en.history.workoutDuration) as HTMLInputElement;
    expect(distance.value).toBe('5');
    expect(duration.value).toBe('25:00');

    fireEvent.change(distance, { target: { value: '5,5' } });
    fireEvent.change(duration, { target: { value: '26:30' } });

    // Ζωντανό pace: 26:30 / 5.5 km = 1590/5.5 = 289.09s ≈ 4:49/km.
    expect(screen.getByText(/4:49\/km/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: en.common.save }));

    await waitFor(async () => {
      const after = (await db.workouts.get(w.id))!;
      expect(after.distance_km).toBe(5.5);
      expect(after.duration_seconds).toBe(26 * 60 + 30);
    });

    // PR recompute: longest_distance 5.5, fastest_pace 1590/5.5 = 289.09 s/km.
    await waitFor(async () => {
      const prs = (await db.personal_records.toArray()).filter((r) => r.deleted_at == null);
      const dist = prs.filter((r) => r.type === 'longest_distance');
      const pace = prs.filter((r) => r.type === 'fastest_pace');
      expect(Math.max(...dist.map((r) => r.value))).toBe(5.5);
      expect(Math.min(...pace.map((r) => r.value))).toBeCloseTo(1590 / 5.5, 1);
    });
  });

  it('άκυρη απόσταση → δεν αποθηκεύει και δείχνει μήνυμα', async () => {
    const w = await runWorkout(5, 25 * 60);
    await renderSheet(w.id);

    const distance = screen.getByLabelText(en.workout.distanceKm) as HTMLInputElement;
    fireEvent.change(distance, { target: { value: '-3' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));

    // Μήνυμα σφάλματος + το workout ΔΕΝ άλλαξε.
    expect(await screen.findByText(en.activities.distanceInvalid)).toBeTruthy();
    const after = (await db.workouts.get(w.id))!;
    expect(after.distance_km).toBe(5);
  });

  it('άκυρη διάρκεια → δεν αποθηκεύει και δείχνει μήνυμα', async () => {
    const w = await runWorkout(5, 25 * 60);
    await renderSheet(w.id);

    const duration = screen.getByLabelText(en.history.workoutDuration) as HTMLInputElement;
    fireEvent.change(duration, { target: { value: '99:99' } });
    fireEvent.click(screen.getByRole('button', { name: en.common.save }));

    expect(await screen.findByText(en.activities.durationInvalid)).toBeTruthy();
    const after = (await db.workouts.get(w.id))!;
    expect(after.duration_seconds).toBe(25 * 60);
  });

  it('δραστηριότητα με σετ (strength) δεν δείχνει πεδίο απόστασης', async () => {
    const w = await startWorkout('strength', '2026-11-18');
    await endWorkout(w.id, 30 * 60);
    const workout = (await db.workouts.get(w.id))!;
    expect((await getWorkoutDetail(w.id))!.workout.activity_kind).toBe('strength');

    render(
      <I18nextProvider i18n={i18next}>
        <ToastProvider>
          <MemoryRouter>
            <EditWorkoutSheet open onClose={() => {}} workout={workout} />
          </MemoryRouter>
        </ToastProvider>
      </I18nextProvider>,
    );
    // Το πεδίο απόστασης δεν υπάρχει για strength.
    await waitFor(() => expect(screen.getByLabelText(en.history.workoutDuration)).toBeTruthy());
    expect(screen.queryByLabelText(en.workout.distanceKm)).toBeNull();
  });
});
