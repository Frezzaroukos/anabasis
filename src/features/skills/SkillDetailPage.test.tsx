import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { SkillDetailPage } from './SkillDetailPage';
import { db } from '@/lib/db';
import { SEED_SKILLS, SEED_SKILL_STEPS } from '@/lib/db/seeds';
import { achieveStep, getSkillProgress } from '@/lib/db/queries';

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: en } },
      interpolation: { escapeValue: false },
    });
  }
  await db.skills.bulkPut(SEED_SKILLS);
  await db.skill_steps.bulkPut(SEED_SKILL_STEPS);
});

const renderAt = (skillId: string) =>
  render(
    <I18nextProvider i18n={i18next}>
      <MemoryRouter initialEntries={[`/skills/${skillId}`]}>
        <Routes>
          <Route path="/skills/:skillId" element={<SkillDetailPage />} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );

describe('SkillDetailPage', () => {
  it('render-άρει τη σκάλα βημάτων ενός skill', async () => {
    const planche = SEED_SKILLS.find((s) => s.name === 'Planche')!;
    renderAt(planche.id);
    await waitFor(() => expect(screen.getByText('Planche')).toBeTruthy());
    // τα πραγματικά seeded βήματα
    expect(screen.getByText('Planche Lean')).toBeTruthy();
    expect(screen.getByText('Full Planche')).toBeTruthy();
    // στόχος ορατός
    await waitFor(() =>
      expect(screen.getAllByText(/Target:/).length).toBeGreaterThan(0),
    );
  });
});

describe('achieveStep (progression logic)', () => {
  it('προχωράει στο επόμενο βήμα και μαρκάρει mastered στο τελευταίο', async () => {
    const skill = SEED_SKILLS.find((s) => s.name === 'Back Lever')!;
    const steps = SEED_SKILL_STEPS.filter((s) => s.skill_id === skill.id).sort(
      (a, b) => a.step_number - b.step_number,
    );
    expect(steps.length).toBeGreaterThan(1);

    // πρώτο βήμα → in_progress, current = δεύτερο
    await achieveStep(skill.id, steps[0]!.id, steps[0]!.target_value);
    let p = await getSkillProgress(skill.id);
    expect(p?.status).toBe('in_progress');
    expect(p?.current_step_id).toBe(steps[1]!.id);

    // υπόλοιπα → mastered
    for (const s of steps.slice(1)) {
      await achieveStep(skill.id, s.id, s.target_value);
    }
    p = await getSkillProgress(skill.id);
    expect(p?.status).toBe('mastered');
    expect(p?.mastered_at).toBeTruthy();
  });
});
