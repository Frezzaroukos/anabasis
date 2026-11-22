import { describe, expect, it, beforeAll } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { SkillDetailPage } from './SkillDetailPage';
import { db } from '@/lib/db';
import { SEED_SKILLS, SEED_SKILL_STEPS } from '@/lib/db/seeds';
import {
  achieveStep,
  addSkillStep,
  createSkill,
  getSkillProgress,
  getSkillStepStats,
  getStepCompletions,
} from '@/lib/db/queries';

// added_weight_kg (v13) UI ακόμα δεν υπάρχει στο πραγματικό src/i18n/en.json —
// ίδιο μοτίβο με το ExercisesPage.test.tsx: τοπικό override μόνο για το test.
const SKILLS_EN = {
  ...en.skills,
  addedWeight: 'Added weight (kg)',
  addedWeightPlaceholder: 'kg (optional)',
  progressOverTime: 'Progress over time',
};

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: { en: { translation: { ...en, skills: SKILLS_EN } } },
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
    expect(screen.getAllByText('Planche Lean').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Full Planche').length).toBeGreaterThan(0);
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

describe('achieveStep — added_weight_kg (v13 difficulty enrichment)', () => {
  it('καταγράφει το βάρος όταν δίνεται', async () => {
    const skill = SEED_SKILLS.find((s) => s.name === 'Human Flag')!;
    const steps = SEED_SKILL_STEPS.filter((s) => s.skill_id === skill.id).sort(
      (a, b) => a.step_number - b.step_number,
    );
    await achieveStep(skill.id, steps[0]!.id, steps[0]!.target_value, 5);
    const completions = await getStepCompletions([steps[0]!.id]);
    expect(completions.get(steps[0]!.id)?.added_weight_kg).toBe(5);
  });

  it('χωρίς βάρος → added_weight_kg: null (bodyweight)', async () => {
    const skill = SEED_SKILLS.find((s) => s.name === 'One Arm Chin-up')!;
    const steps = SEED_SKILL_STEPS.filter((s) => s.skill_id === skill.id).sort(
      (a, b) => a.step_number - b.step_number,
    );
    await achieveStep(skill.id, steps[0]!.id, steps[0]!.target_value);
    const completions = await getStepCompletions([steps[0]!.id]);
    expect(completions.get(steps[0]!.id)?.added_weight_kg).toBeNull();
  });
});

describe('SkillDetailPage — καταγραφή βάρους από το UI', () => {
  it('το πεδίο βάρους στο τρέχον βήμα καταγράφεται με το «Mark achieved»', async () => {
    const skill = SEED_SKILLS.find((s) => s.name === 'Muscle Up')!;
    renderAt(skill.id);
    await waitFor(() => expect(screen.getByText('Muscle Up')).toBeTruthy());

    const valueInput = screen.getByLabelText('Achieved') as HTMLInputElement;
    const weightInput = screen.getByLabelText('Added weight (kg)') as HTMLInputElement;
    fireEvent.change(valueInput, { target: { value: '5' } });
    fireEvent.change(weightInput, { target: { value: '5' } });
    fireEvent.click(screen.getByText('Mark achieved'));

    await waitFor(() => expect(screen.getByText(/\+ 5kg/)).toBeTruthy());
  });
});

describe('SkillDetailPage — ορατή πρόοδος, undo και αναδιάταξη', () => {
  async function customSkill(name: string, steps: string[]) {
    const skill = await createSkill({ name });
    const rows = [];
    for (const stepName of steps) {
      rows.push(await addSkillStep(skill.id, { name: stepName, target_value: 10 }));
    }
    return { skill, steps: rows };
  }

  it('δείχνει τρέχον βήμα, επόμενο στόχο και τελευταία επίτευξη', async () => {
    const { skill, steps } = await customSkill('E2E Progress Skill', ['One', 'Two']);
    await achieveStep(skill.id, steps[0]!.id, steps[0]!.target_value);

    renderAt(skill.id);
    await waitFor(() => expect(screen.getByText('E2E Progress Skill')).toBeTruthy());
    expect(screen.getByText(/Current step:/)).toBeTruthy();
    expect(screen.getByText(/Next target:/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/Last achieved:/)).toBeTruthy());
  });

  it('αναίρεση Mark achieved με ένα κουμπί (tombstone completion)', async () => {
    const { skill, steps } = await customSkill('E2E Undo Skill', ['Only step']);
    renderAt(skill.id);
    await waitFor(() => expect(screen.getByText('E2E Undo Skill')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Mark achieved' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Undo mark achieved' })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Undo mark achieved' }));

    await waitFor(async () => {
      expect((await getSkillStepStats()).get(skill.id)).toEqual({ total: 1, done: 0 });
    });
    expect(await getStepCompletions([steps[0]!.id])).toEqual(new Map());
    const raw = await db.user_skill_step_completions
      .where('user_id')
      .equals((await import('@/lib/db/session')).getCurrentUserId())
      .toArray();
    expect(raw.filter((r) => r.skill_step_id === steps[0]!.id).every((r) => r.deleted_at != null)).toBe(true);
  });

  it('αναδιατάσσει βήματα πάνω/κάτω και ξαναδένει τα prerequisites', async () => {
    const { skill, steps } = await customSkill('E2E Reorder Skill', ['A', 'B', 'C']);
    renderAt(skill.id);
    await waitFor(() => expect(screen.getByText('E2E Reorder Skill')).toBeTruthy());

    const moveDown = screen.getAllByRole('button', { name: 'Move step down' });
    fireEvent.click(moveDown[0]!);

    await waitFor(async () => {
      const rows = (await db.skill_steps.where('skill_id').equals(skill.id).toArray()).sort(
        (a, b) => a.step_number - b.step_number,
      );
      expect(rows.map((r) => r.name)).toEqual(['B', 'A', 'C']);
      expect(rows.map((r) => r.prerequisites)).toEqual([[], [rows[0]!.id], [rows[1]!.id]]);
    });
    expect(steps).toHaveLength(3);
  });
});

describe('SkillDetailPage — προβολή added_weight_kg στη σκάλα', () => {
  it('δείχνει το βάρος-στόχο ενός βήματος (π.χ. «Full X + 5kg»)', async () => {
    const skill = SEED_SKILLS.find((s) => s.name === 'V-Sit')!;
    const steps = SEED_SKILL_STEPS.filter((s) => s.skill_id === skill.id).sort(
      (a, b) => a.step_number - b.step_number,
    );
    await db.skill_steps.update(steps[0]!.id, { added_weight_kg: 3 });

    renderAt(skill.id);
    await waitFor(() => expect(screen.getByText('V-Sit')).toBeTruthy());
    expect(screen.getAllByText(/\+ 3kg/).length).toBeGreaterThan(0);
  });
});
