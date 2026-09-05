import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import en from '@/i18n/en.json';
import { SettingsPage } from './SettingsPage';
import { exportAll, importAll } from '@/lib/db/queries';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
});

function renderHub() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('SettingsPage — hub', () => {
  it('δείχνει κάθε ομάδα ρυθμίσεων ως σύνδεσμο', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByText('Settings')).toBeTruthy());

    const links = Object.fromEntries(
      screen.getAllByRole('link').map((a) => [a.textContent ?? '', a.getAttribute('href')]),
    );
    const hrefFor = (label: string) =>
      Object.entries(links).find(([text]) => text.startsWith(label))?.[1];

    expect(hrefFor('Account')).toBe('/settings/account');
    expect(hrefFor('Device profiles')).toBe('/settings/profiles');
    expect(hrefFor('Appearance')).toBe('/settings/appearance');
    expect(hrefFor('Training')).toBe('/settings/training');
    expect(hrefFor('Data & backups')).toBe('/settings/data');
    expect(hrefFor('About & share')).toBe('/settings/about');
  });

  it('κρατά τη βιβλιοθήκη προσβάσιμη — το bottom nav δεν χωρά άλλα tabs', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByText('Your library')).toBeTruthy());
    expect(screen.getByText('Exercises')).toBeTruthy();
    expect(screen.getByText('Activities')).toBeTruthy();
  });

  /**
   * Η ΔΙΠΛΗ ΤΑΥΤΟΤΗΤΑ ήταν το πραγματικό πρόβλημα των Ρυθμίσεων: cloud
   * λογαριασμός και τοπικά προφίλ συσκευής με σχεδόν ίδιο όνομα, σε δύο
   * διαφορετικά σημεία. Τώρα στέκονται δίπλα-δίπλα με διακριτά ονόματα.
   */
  it('ξεχωρίζει τον λογαριασμό cloud από τα προφίλ συσκευής', async () => {
    renderHub();
    await waitFor(() => expect(screen.getByText('Account')).toBeTruthy());
    expect(screen.getByText('Device profiles')).toBeTruthy();
    // Χωρίς σύνδεση δεν λέμε ψέματα ότι υπάρχει λογαριασμός.
    expect(screen.getByText('Not signed in')).toBeTruthy();
  });
});

describe('export / import', () => {
  it('παράγει έγκυρο backup που γίνεται import πίσω', async () => {
    const json = await exportAll();
    const parsed = JSON.parse(json);
    expect(parsed.format).toBe('anabasis-backup');
    expect(parsed.version).toBe(2);
    expect(parsed.data).toBeTruthy();

    const res = await importAll(json);
    expect(res.ok).toBe(true);
  });

  it('απορρίπτει σκουπίδια χωρίς να πετάξει', async () => {
    expect((await importAll('οχι json')).ok).toBe(false);
    expect((await importAll('{"format":"other"}')).ok).toBe(false);
  });
});
