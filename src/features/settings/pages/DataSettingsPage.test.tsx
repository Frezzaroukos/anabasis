import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { DataSettingsPage } from './DataSettingsPage';
import { db } from '@/lib/db';
import { createExercise, endWorkout, startWorkout } from '@/lib/db/queries';
import { setCurrentUserId } from '@/lib/db/session';

/**
 * «Delete all data» = δύο ανεξάρτητα confirms. Αυτό το test κλειδώνει ότι το
 * πρώτο δεν σβήνει τίποτα και ότι μόνο το δεύτερο εκτελεί το wipe.
 */
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
  setCurrentUserId('data-settings-test');
  await db.workouts.clear();
  await db.sets.clear();
  await db.exercises.clear();
  await db.activities.clear();
});

function renderPage() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <DataSettingsPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('DataSettingsPage — delete all data', () => {
  it('θέλει δύο confirms και σβήνει μόνο στο δεύτερο', async () => {
    const ex = await createExercise({ name: 'Squat' });
    const w = await startWorkout('strength', '2026-08-15');
    await endWorkout(w.id, 600);
    expect(ex.id).toBeTruthy();

    renderPage();
    expect(await screen.findByText('planned')).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Delete all data' }));

    // Πρώτο confirm: εξήγηση, καμία διαγραφή ακόμα.
    await waitFor(() => expect(screen.getByText('Delete all data?')).toBeTruthy());
    expect((await db.workouts.get(w.id))?.deleted_at).toBeFalsy();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    // Δεύτερο confirm: τελική προειδοποίηση.
    await waitFor(() => expect(screen.getByText('Are you absolutely sure?')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Delete everything' }));

    await waitFor(() =>
      expect(screen.getByText('All data for this profile was deleted.')).toBeTruthy(),
    );
    expect((await db.workouts.get(w.id))?.deleted_at).toBeTruthy();
  });
});

describe('DataSettingsPage — import feedback is brought into view', () => {
  it('scrolls the import preview into view after choosing a backup file', async () => {
    const scrolled = vi.fn();
    Element.prototype.scrollIntoView = scrolled;
    renderPage();
    const backup = JSON.stringify({ app: 'anabasis', version: 1, exportedAt: new Date().toISOString(), tables: {} });
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    const file = new File([backup], 'backup.json', { type: 'application/json' });
    fireEvent.change(input, { target: { files: [file] } });
    // Είτε preview είτε μήνυμα σφάλματος — και τα δύο πρέπει να έρθουν στο οπτικό πεδίο.
    await waitFor(() => expect(scrolled).toHaveBeenCalled());
  });
});
