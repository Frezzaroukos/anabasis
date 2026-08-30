import { afterEach, describe, expect, it, beforeAll, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import { DashboardPage } from './DashboardPage';
import { db } from '@/lib/db';
import { setCurrentUserId } from '@/lib/db/session';
import { SEED_EXERCISES, SEED_SKILLS, SEED_SKILL_STEPS } from '@/lib/db/seeds';
import {
  achieveStep,
  addSet,
  endWorkout,
  localDay,
  saveBodyMetric,
  startWorkout,
} from '@/lib/db/queries';

/**
 * Ίδιο fixture-πρότυπο με SettingsPage/SkillsPage tests: i18n merged με ένα
 * τοπικό dashboard namespace — το πραγματικό en.json/el.json το ενημερώνει
 * ο team lead, το test δεν εξαρτάται από αυτό.
 */
const dashboardEn = {
  title: 'Overview',
  noData: 'Nothing logged yet. Start a workout to see your stats here.',
  consistency: 'Consistency',
  last7days: 'Last 7 days',
  last30days: 'Last 30 days',
  weeklyVolume: 'Weekly volume',
  thisWeek: 'this week',
  vsLastWeek: 'vs last week',
  skillsProgress: 'Skills progress',
  latestWeight: 'Latest weight',
  latestBodyFat: 'Latest body fat',
  todayBalance: "Today's balance",
  // Νέα κλειδιά του hero fallback ladder (W-D) — δεν είναι ακόμα στο
  // πραγματικό en.json (report στο team lead), ίδιο πρότυπο local-override.
  hero: { weekUnit: 'days this week', lastSessionUnit: 'days since last session' },
};

beforeAll(async () => {
  if (!i18next.isInitialized) {
    await i18next.init({
      lng: 'en',
      resources: {
        en: {
          translation: {
            ...en,
            dashboard: {
              ...en.dashboard,
              ...dashboardEn,
              hero: { ...en.dashboard.hero, ...dashboardEn.hero },
            },
          },
        },
      },
      interpolation: { escapeValue: false },
    });
  }
});

const wrap = (ui: React.ReactNode) => (
  <I18nextProvider i18n={i18next}>
    <MemoryRouter>{ui}</MemoryRouter>
  </I18nextProvider>
);

describe('DashboardPage — empty DB', () => {
  beforeAll(() => {
    // Καθαρό, ξεχωριστό προφίλ ώστε δεδομένα άλλων suites να μη φαίνονται.
    setCurrentUserId('dashboard-empty-profile');
  });

  it('χωρίς δεδομένα: προτείνει επόμενα βήματα, όχι ψεύτικα μηδενικά', async () => {
    render(wrap(<DashboardPage />));

    // Η κενή Αρχική δεν είναι σιωπηλή — δείχνει τι να κάνεις μετά.
    await waitFor(() => expect(screen.getByText(en.dashboard.next.title)).toBeTruthy());
    expect(screen.getByText(en.dashboard.next.goal)).toBeTruthy();

    // Καμία κάρτα με μηδενικά: ένα «0/7» θα έδειχνε σαν να μετρήθηκε κάτι.
    expect(screen.queryByText(dashboardEn.consistency)).toBeNull();
    expect(screen.queryByText('0/7')).toBeNull();
    expect(screen.queryByText(dashboardEn.weeklyVolume)).toBeNull();

    // Body/History/Progress ζουν πλέον στο «Περισσότερα» του bottom nav —
    // η Αρχική δεν κουβαλά πια σειρά με μικρά κουμπάκια.
    expect(screen.queryByText('Exercise progress')).toBeNull();
  });
});

describe('DashboardPage — με δεδομένα', () => {
  beforeAll(async () => {
    // Απομονωμένο προφίλ: τα test files μοιράζονται τη fake-indexeddb βάση,
    // οπότε workouts από άλλα suites θα «μόλυναν» τα consistency/volume counts.
    setCurrentUserId('dashboard-test-profile');
    await db.exercises.bulkPut(SEED_EXERCISES);
    await db.skills.bulkPut(SEED_SKILLS);
    await db.skill_steps.bulkPut(SEED_SKILL_STEPS);

    const squat = SEED_EXERCISES.find((e) => e.name === 'Back Squat')!;
    const w = await startWorkout();
    await addSet({
      workout_id: w.id,
      exercise_id: squat.id,
      weight_kg: 100,
      bodyweight_kg: null,
      reps: 5,
      hold_seconds: null,
    });

    const skill = SEED_SKILLS.find((s) => s.name === 'Back Lever')!;
    const firstStep = SEED_SKILL_STEPS.filter((s) => s.skill_id === skill.id).sort(
      (a, b) => a.step_number - b.step_number,
    )[0]!;
    await achieveStep(skill.id, firstStep.id, firstStep.target_value);

    await saveBodyMetric(localDay(), {
      weight_kg: 78.5,
      body_fat_pct: 17,
      steps: 9200,
    });
  });

  it('δείχνει consistency, όγκο, PR, skills και σώμα με πραγματικά δεδομένα', async () => {
    render(wrap(<DashboardPage />));

    // Η συνέπεια 7/30 ζει πλέον ως λεπτή γραμμή (όχι ξεχωριστό κουτί).
    await waitFor(() => expect(screen.getByText(dashboardEn.consistency)).toBeTruthy());
    expect(screen.getByText('1/7')).toBeTruthy();

    // Ο όγκος έρχεται από ξεχωριστό liveQuery (trend14)· τα insights/heatmap
    // πρόσθεσαν liveQueries που ανταγωνίζονται, οπότε θέλει waitFor.
    await waitFor(() =>
      expect(screen.getByText(dashboardEn.weeklyVolume)).toBeTruthy(),
    );
    // Το όνομα της άσκησης έρχεται από ΔΕΥΤΕΡΟ liveQuery (listExercises) που
    // μπορεί να λύσει μετά τα PRs — χωρίς waitFor το test είναι flaky και
    // βλέπει το placeholder «—». Ένα σετ δίνει πολλαπλά PR-candidates
    // (max_weight/max_reps/e1rm), άρα το όνομα εμφανίζεται σε >1 γραμμή.
    await waitFor(() =>
      expect(screen.getAllByText('Back Squat').length).toBeGreaterThan(0),
    );

    // header έχει βέλος πλέον (clickable card προς /skills) — regex αντί για exact match
    expect(screen.getByText(new RegExp(dashboardEn.skillsProgress))).toBeTruthy();

    expect(screen.getByText(dashboardEn.latestWeight)).toBeTruthy();
    expect(screen.getByText(/78\.5 kg/)).toBeTruthy();
    expect(screen.getByText(dashboardEn.latestBodyFat)).toBeTruthy();
    expect(screen.getByText(/17%/)).toBeTruthy();
    // Οι θερμίδες βγήκαν εκτός scope· τα βήματα είναι η νέα μετρική σώματος.
    expect(screen.queryByText(dashboardEn.todayBalance)).toBeNull();
    expect(screen.getByText(/9,?200/)).toBeTruthy();
  });
});

/**
 * Hero fallback ladder (ARCHITECTURE-V4 §7 W-D, owner feedback «να μην
 * καταρρέει το hero»): σερί → μέρες αυτή την εβδομάδα → τελευταία προπόνηση
 * → μόνο χωρίς ΚΑΘΟΛΟΥ ιστορικό μένει γυμνός τίτλος. Σταθερή «σήμερα»
 * (Πέμπτη 2026-08-20, εβδομάδα Δευτ 17 → Κυρ 23) ώστε το Δευτέρα-Κυριακή
 * παράθυρο του WeekStrip/hero να είναι προβλέψιμο.
 */
describe('DashboardPage — hero fallback ladder', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('χωρίς ΚΑΘΟΛΟΥ ιστορικό: γυμνός τίτλος, κανένα από τα tier labels', async () => {
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    setCurrentUserId('dashboard-hero-empty');

    render(wrap(<DashboardPage />));

    await waitFor(() => expect(screen.getByText(en.dashboard.title)).toBeTruthy());
    expect(screen.queryByText(en.dashboard.hero.streakUnit)).toBeNull();
    expect(screen.queryByText(dashboardEn.hero.weekUnit)).toBeNull();
    expect(screen.queryByText(dashboardEn.hero.lastSessionUnit)).toBeNull();
  });

  it('σερί σπασμένο αλλά προπόνηση μέσα στην εβδομάδα: δείχνει "μέρες αυτή την εβδομάδα"', async () => {
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    setCurrentUserId('dashboard-hero-week');

    // Τρίτη (18/08) — μέσα στην τρέχουσα εβδομάδα, αλλά ΟΧΙ σήμερα/χθες:
    // το σερί σπάει (0), η εβδομάδα όχι.
    const w = await startWorkout('strength', '2026-08-18');
    await endWorkout(w.id);

    render(wrap(<DashboardPage />));

    await waitFor(() => expect(screen.getByText(dashboardEn.hero.weekUnit)).toBeTruthy());
    expect(screen.queryByText(en.dashboard.hero.streakUnit)).toBeNull();
    expect(screen.queryByText(dashboardEn.hero.lastSessionUnit)).toBeNull();
  });

  it('καμία προπόνηση αυτή την εβδομάδα, αλλά υπάρχει ιστορικό: δείχνει "τελευταία προπόνηση"', async () => {
    vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
    setCurrentUserId('dashboard-hero-last');

    // Προηγούμενη εβδομάδα (10/08) — έξω από το τρέχον Δευτέρα-Κυριακή.
    const w = await startWorkout('strength', '2026-08-10');
    await endWorkout(w.id);

    render(wrap(<DashboardPage />));

    await waitFor(() => expect(screen.getByText(dashboardEn.hero.lastSessionUnit)).toBeTruthy());
    expect(screen.queryByText(en.dashboard.hero.streakUnit)).toBeNull();
    expect(screen.queryByText(dashboardEn.hero.weekUnit)).toBeNull();
  });
});
