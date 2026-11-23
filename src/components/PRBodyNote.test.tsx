import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import type { PersonalRecord } from '@/lib/db/types';
import { PRBodyNote } from './PRBodyNote';

const UID = 'pr-body-note-profile';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({ lng: 'en', resources: { en: { translation: en } }, interpolation: { escapeValue: false } });
  }
  setCurrentUserId(UID);
});

const row = (over: Partial<PersonalRecord>): PersonalRecord => ({
  id: 'x', user_id: UID, exercise_id: 'ex-note', activity_kind: null, type: 'max_total_load',
  value: 90, reps: 8, weight_kg: 10, bodyweight_kg: 80, achieved_at: '2026-11-01T10:00:00.000Z',
  workout_id: 'w1', set_id: 's1', created_at: '2026-11-01T10:00:00.000Z', updated_at: '2026-11-01T10:00:00.000Z',
  ...over,
});

describe('PRBodyNote', () => {
  it('δείχνει «συνολικό φορτίο · σώμα» όταν το ρεκόρ ήρθε και από αύξηση σωματικού βάρους', async () => {
    const prev = row({ id: 'p1' });
    const cur = row({ id: 'p2', value: 92, bodyweight_kg: 82, workout_id: 'w2', set_id: 's2', achieved_at: '2026-11-10T10:00:00.000Z' });
    await db.personal_records.bulkPut([prev, cur]);
    render(
      <I18nextProvider i18n={i18next}>
        <PRBodyNote pr={cur} unit="kg" />
      </I18nextProvider>,
    );
    expect(await screen.findByText(/\+2 kg total load · body \+2 kg/)).toBeTruthy();
  });

  it('τίποτα για άλλους τύπους ή χωρίς προηγούμενο', async () => {
    const { container } = render(
      <I18nextProvider i18n={i18next}>
        <PRBodyNote pr={row({ id: 'p3', type: 'max_reps', value: 12 })} unit="kg" />
      </I18nextProvider>,
    );
    expect(container.textContent).toBe('');
  });
});
