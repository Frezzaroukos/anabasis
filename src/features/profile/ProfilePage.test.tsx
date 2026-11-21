import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import { ProfilePage } from './ProfilePage';
import { db } from '@/lib/db';
import { createProfile } from '@/lib/db/queries';
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

function renderPage() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <ProfilePage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

/**
 * Το μέτωπο ήταν η ΔΙΠΛΗ ΤΑΥΤΟΤΗΤΑ: cloud λογαριασμός και τοπικά προφίλ
 * συσκευής είχαν σχεδόν ίδιο όνομα και ζούσαν σε δύο σημεία. Αυτά τα tests
 * κλειδώνουν ότι η σελίδα λέει ρητά ΤΙ είναι και πού είναι το άλλο.
 */
describe('ProfilePage — ταυτότητα συσκευής vs λογαριασμού', () => {
  it('ονομάζεται ρητά «σε αυτή τη συσκευή», όχι σκέτο «Προφίλ»', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Profiles on this device')).toBeTruthy());
  });

  it('εξηγεί ότι δεν έχουν κωδικό και ότι συγχρονίζεται μόνο το ενεργό', async () => {
    renderPage();
    const desc = await screen.findByText(/no password/i);
    expect(desc.textContent).toMatch(/only the active one/i);
  });

  it('δίνει δρόμο προς τον λογαριασμό — εκεί ζουν email/κωδικός/sync', async () => {
    renderPage();
    const link = await screen.findByRole('link', { name: /your account/i });
    expect(link.getAttribute('href')).toBe('/settings/account');
  });

  it('χωρίς λογαριασμό ΔΕΝ ισχυρίζεται ότι κάτι συγχρονίζεται', async () => {
    renderPage();
    await waitFor(() => expect(screen.getByText('Profiles on this device')).toBeTruthy());
    expect(screen.queryByText(/· synced/)).toBeNull();
  });
});

describe('ProfilePage — backup πριν από τη διαγραφή', () => {
  const createObjectURL = vi.fn(() => 'blob:profile-backup');

  beforeEach(async () => {
    setCurrentUserId('profile-keeper');
    await db.users.clear();
    await db.app_settings.clear();
    await createProfile('First');
    await createProfile('Second');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    createObjectURL.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('κατεβάζει JSON backup πριν το deleteProfile', async () => {
    renderPage();
    const label = await screen.findByText('Second');
    const row = label.closest('div.rounded-lg') as HTMLElement;

    fireEvent.click(within(row).getByRole('button', { name: 'Delete profile' }));
    await waitFor(() => expect(within(row).getByText('Delete this profile and all its data?')).toBeTruthy());

    const confirmButtons = within(row).getAllByRole('button', { name: 'Delete profile' });
    fireEvent.click(confirmButtons[confirmButtons.length - 1]!);

    await waitFor(() => expect(screen.queryByText('Second')).toBeNull());
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    const remaining = await db.users.toArray();
    expect(remaining.map((u) => u.display_name)).toEqual(['First']);
  });
});
