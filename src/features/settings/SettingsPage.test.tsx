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

describe('SettingsPage', () => {
  it('render-άρει γλώσσα, rest presets, μονάδες και data section', async () => {
    render(
      <I18nextProvider i18n={i18next}>
        {/* Η σελίδα έχει πλέον <Link> προς τη βιβλιοθήκη — θέλει router context */}
        <MemoryRouter>
          <SettingsPage />
        </MemoryRouter>
      </I18nextProvider>,
    );
    await waitFor(() => expect(screen.getByText('Settings')).toBeTruthy());
    expect(screen.getByText('EN')).toBeTruthy();
    expect(screen.getByText('Units')).toBeTruthy();
    expect(screen.getByText('Your data')).toBeTruthy();
    expect(screen.getByText('Export backup')).toBeTruthy();
    // η βιβλιοθήκη (ασκήσεις/δραστηριότητες/skills) είναι προσβάσιμη από εδώ,
    // αφού το bottom nav είναι γεμάτο στα 6 tabs
    expect(screen.getByText('Your library')).toBeTruthy();
    expect(screen.getByText('Exercises')).toBeTruthy();
    expect(screen.getByText('Activities')).toBeTruthy();
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
