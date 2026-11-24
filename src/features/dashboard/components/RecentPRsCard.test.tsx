import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { db } from '@/lib/db';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { getCurrentUserId } from '@/lib/db/session';
import type { PersonalRecord } from '@/lib/db/types';
import { RecentPRsCard } from './RecentPRsCard';

const pull = SEED_EXERCISES.find((e) => e.name === 'Pull-ups')!;
const ago = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString();

let n = 0;
const row = (p: Pick<PersonalRecord, 'type' | 'value' | 'workout_id' | 'achieved_at'> & Partial<PersonalRecord>): PersonalRecord => {
  n += 1;
  return {
    id: `card-pr-${n}`,
    user_id: getCurrentUserId(),
    exercise_id: pull.id,
    activity_kind: null,
    reps: null,
    weight_kg: null,
    set_id: `card-set-${n}`,
    created_at: p.achieved_at,
    updated_at: p.achieved_at,
    deleted_at: null,
    ...p,
  };
};

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
  await db.exercises.bulkPut(SEED_EXERCISES);
});

beforeEach(async () => {
  await db.personal_records.clear();
});

function renderCard() {
  return render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter>
        <RecentPRsCard />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('RecentPRsCard', () => {
  it('μόνο 30 ημέρες, ένα (το καλύτερο) ανά άσκηση+τύπο, reps-ισοδύναμο ως «≈», «όλα» → Πρόοδος', async () => {
    await db.personal_records.bulkAdd([
      row({ type: 'max_reps', value: 10, workout_id: 'base', achieved_at: ago(200) }),
      row({ type: 'rep_equivalent', value: 10, workout_id: 'base', achieved_at: ago(200) }),
      row({ type: 'max_reps', value: 15, workout_id: 'old', achieved_at: ago(40) }),
      row({ type: 'max_reps', value: 18, workout_id: 'a', achieved_at: ago(5) }),
      row({ type: 'max_reps', value: 17, workout_id: 'b', achieved_at: ago(2) }),
      row({ type: 'rep_equivalent', value: 25, reps: 1, weight_kg: 40, workout_id: 'c', achieved_at: ago(3) }),
    ]);
    renderCard();

    const list = await screen.findByRole('list');
    await waitFor(() => expect(within(list).getAllByRole('listitem')).toHaveLength(2));
    expect(within(list).getByText('18')).toBeTruthy();
    expect(within(list).queryByText('17')).toBeNull();
    expect(within(list).queryByText('15')).toBeNull();
    expect(within(list).getByText('≈ 25')).toBeTruthy();
    expect(within(list).getByText('Rep-equivalent')).toBeTruthy();
    expect(within(list).queryByText(/40 kg/)).toBeNull(); // ποτέ ως βάρος

    expect(screen.getByRole('link', { name: /View all/i }).getAttribute('href')).toBe('/progress');
  });

  it('μόνο παλιά ρεκόρ → η κάρτα δεν εμφανίζεται', async () => {
    await db.personal_records.bulkAdd([
      row({ type: 'max_reps', value: 10, workout_id: 'base', achieved_at: ago(200) }),
      row({ type: 'max_reps', value: 15, workout_id: 'old', achieved_at: ago(45) }),
    ]);
    const { container } = renderCard();
    await new Promise((r) => setTimeout(r, 50));
    expect(container.querySelector('section')).toBeNull();
  });
});
