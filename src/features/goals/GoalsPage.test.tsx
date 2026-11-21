import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { createGoal, listGoals } from '@/lib/db/goals';
import { GoalsPage } from './GoalsPage';

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

beforeEach(async () => {
  setCurrentUserId('goals-page-test-profile');
  await db.goals.clear();
  await db.workouts.clear();
});

const wrap = () => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>
      <GoalsPage />
    </MemoryRouter>
  </I18nextProvider>
);

describe('GoalsPage — διαγραφή & αρχειοθέτηση', () => {
  it('η διαγραφή περνά από ConfirmDialog (δεν σβήνει αμέσως)', async () => {
    await createGoal({ metric: 'sessions', target: 4, period: 'week' });
    render(wrap());

    // Ο στόχος φαίνεται.
    await waitFor(() => expect(screen.getByText(/4 sessions/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: en.common.delete }));
    // Βγήκε dialog επιβεβαίωσης — ο στόχος δεν έχει σβηστεί ακόμα.
    await waitFor(() => expect(screen.getByText(en.goals.deleteConfirmTitle)).toBeTruthy());
    expect(await listGoals()).toHaveLength(1);

    // Επιβεβαίωση → soft delete (το dialog's Delete, όχι το row icon).
    const deleteButtons = screen.getAllByRole('button', { name: en.common.delete });
    fireEvent.click(deleteButtons[deleteButtons.length - 1]!);
    await waitFor(async () => expect(await listGoals()).toHaveLength(0));
  });

  it('αρχειοθέτηση κρύβει τον στόχο και εμφανίζει το toggle', async () => {
    await createGoal({ metric: 'sessions', target: 4, period: 'week' });
    render(wrap());

    // Ο πλήρης τίτλος («4 sessions / week») — όχι το hint του empty state.
    await waitFor(() => expect(screen.getByText('4 sessions / week')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: en.goals.archive }));

    // Ο στόχος φεύγει από την ενεργή λίστα (μένει archived στη βάση).
    await waitFor(() => expect((screen.queryByText('4 sessions / week'))).toBeNull());
    const rows = await listGoals(true);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.is_archived).toBe(true);
    expect(rows[0]!.deleted_at).toBeNull();
    // Εμφανίστηκε το toggle για τα αρχειοθετημένα.
    expect(screen.getByText(/Show archived \(1\)/)).toBeTruthy();
  });
});
