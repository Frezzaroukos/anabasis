import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { SkillsPage } from './SkillsPage';
import { db } from '@/lib/db';
import { SEED_SKILLS, SEED_SKILL_STEPS } from '@/lib/db/seeds';

/**
 * Smoke tests: επαληθεύουν ότι οι οθόνες ΟΝΤΩΣ render-άρουν με πραγματικά
 * seed δεδομένα. Πιάνουν ό,τι θα έπιανε ένα οπτικό πέρασμα (crash, λάθος
 * query, λείπον i18n key) χωρίς να χρειάζεται browser.
 */
beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
  await db.skills.bulkPut(SEED_SKILLS);
  await db.skill_steps.bulkPut(SEED_SKILL_STEPS);
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nextProvider>
);

describe('SkillsPage', () => {
  it('δείχνει τα seeded skills με πρόοδο', async () => {
    render(wrap(<SkillsPage />));
    await waitFor(() => expect(screen.getByText('Front Lever')).toBeTruthy());
    expect(screen.getByText('Planche')).toBeTruthy();
    // progress counter (0/N) — αποδεικνύει ότι τα step-counts υπολογίστηκαν
    await waitFor(() => expect(screen.getAllByText(/0\/\d/).length).toBeGreaterThan(0));
  });
});
