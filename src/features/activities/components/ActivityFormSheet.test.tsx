import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { ActivityFormSheet } from './ActivityFormSheet';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { ToastProvider } from '@/components/ui/toast';

/**
 * Ο χρωματικός picker πρέπει να έχει ΟΥΣΙΑΣΤΙΚΟ όνομα («Blue», «Rose red»),
 * όχι το raw tailwind class (`bg-blue-400`) — αλλιώς ο screen reader λέει
 * ασυναρτησίες.
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
  setCurrentUserId('activity-form-a11y');
  await db.activities.clear();
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <ToastProvider>{ui}</ToastProvider>
  </I18nextProvider>
);

describe('ActivityFormSheet — color picker a11y', () => {
  it('κάθε χρώμα είναι role=radio με ουσιαστικό όνομα χρώματος (όχι tailwind class)', () => {
    render(wrap(<ActivityFormSheet open onClose={() => {}} activity={null} />));

    // Όλα τα χρωματικά radios, με το μεταφρασμένο όνομα.
    const blue = screen.getByRole('radio', { name: en.activities.colors.blue });
    expect(blue).toBeTruthy();
    expect(blue.getAttribute('aria-label')).toBe(en.activities.colors.blue);
    // Δεν διαρρέει το raw tailwind class ως όνομα.
    expect(blue.getAttribute('aria-label')).not.toContain('bg-');
    expect(screen.queryByRole('radio', { name: 'bg-blue-400' })).toBeNull();

    // Όλα τα 12 ονόματα υπάρχουν και είναι προσβάσιμα.
    for (const key of Object.values(en.activities.colors)) {
      expect(screen.getAllByRole('radio', { name: key }).length).toBe(1);
    }
  });

  it('επιλέγει χρώμα μετά από click και δείχνει aria-checked', () => {
    render(wrap(<ActivityFormSheet open onClose={() => {}} activity={null} />));
    const rose = screen.getByRole('radio', { name: en.activities.colors.rose });
    fireEvent.click(rose);
    expect(rose.getAttribute('aria-checked')).toBe('true');
  });
});
