import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ActivitiesPage } from './ActivitiesPage';
import { db } from '@/lib/db';
import { createActivity } from '@/lib/db/queries';
import { SEED_ACTIVITIES } from '@/lib/db/seeds';
import { setCurrentUserId } from '@/lib/db/session';

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
});

function renderPage() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <ActivitiesPage />
      </MemoryRouter>
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
  });
});
