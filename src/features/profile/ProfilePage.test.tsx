import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import { ProfilePage } from './ProfilePage';

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
