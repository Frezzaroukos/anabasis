import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ActivitiesPage } from './ActivitiesPage';
import { db } from '@/lib/db';
import { createActivity } from '@/lib/db/queries';
import { SEED_ACTIVITIES } from '@/lib/db/seeds';
import { setCurrentUserId } from '@/lib/db/session';
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
  setCurrentUserId('activities-page-test');
  await db.activities.clear();
  await db.activities.bulkAdd(SEED_ACTIVITIES);
  await db.workouts.clear();
  await db.sets.clear();
  await db.personal_records.clear();
});

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPage() {
  return render(
    <I18nextProvider i18n={i18next}>
      <ToastProvider>
        <MemoryRouter>
          <ActivitiesPage />
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </I18nextProvider>,
  );
}

describe('ActivitiesPage — διαγραφή custom δραστηριότητας', () => {
  it('δείχνει το κουμπί μόνο σε custom και διαγράφει μετά από confirm', async () => {
    const custom = await createActivity({ label: 'Parkour' });
    renderPage();

    await waitFor(() => expect(screen.getByText('Parkour')).toBeTruthy());
    // Τα builtin rows δεν έχουν κουμπί διαγραφής — μόνο το ένα custom.
    const buttons = screen.getAllByRole('button', { name: 'Delete activity' });
    expect(buttons).toHaveLength(1);

    fireEvent.click(buttons[0]!);
    await waitFor(() => expect(screen.getByRole('dialog')).toBeTruthy());

    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(screen.queryByText('Parkour')).toBeNull());
    expect((await db.activities.get(custom.id))?.deleted_at).toBeTruthy();

    const toast = screen.getByRole('status');
    expect(toast.textContent).toContain('Activity deleted');
    fireEvent.click(within(toast).getByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(screen.getByText('Parkour')).toBeTruthy());
    expect((await db.activities.get(custom.id))?.deleted_at).toBeNull();
  });

  it('ξεκινά τρέξιμο απευθείας από τη δραστηριότητα (χωρίς πρόγραμμα)', async () => {
    renderPage();
    const runRow = (await screen.findByText('Run')).closest('li') as HTMLElement;
    fireEvent.click(within(runRow).getByRole('button', { name: 'Start' }));

    await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/workout/active'));
    const [workout] = await db.workouts.toArray();
    expect(workout?.activity_kind).toBe('run');
    expect(workout?.workout_type).toBe('Run');
    expect(workout?.ended_at).toBeNull();
  });
});
