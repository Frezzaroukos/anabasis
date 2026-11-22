import { beforeAll, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import i18next from 'i18next';
import { I18nextProvider } from 'react-i18next';
import en from '@/i18n/en.json';
import el from '@/i18n/el.json';
import { SEED_EXERCISES } from '@/lib/db/seeds';
import { parseQuickSets } from '@/features/workout/quickLog';
import { parseWorkoutNotes } from '@/features/workout/parseWorkoutNotes';
import { GuidePage } from './GuidePage';
import {
  GUIDE_SECTIONS,
  PASTE_EXAMPLES,
  QUICK_LOG_EXAMPLES,
} from './guideContent';

function hasPath(tree: unknown, path: string): boolean {
  let current: unknown = tree;
  for (const part of path.split('.')) {
    if (typeof current !== 'object' || current == null || !(part in current)) return false;
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === 'string' && current.length > 0;
}

beforeAll(async () => {
  await i18next.init({
    lng: 'en',
    resources: { en: { translation: en } },
    interpolation: { escapeValue: false },
  });
});

function renderGuide() {
  return render(
    <I18nextProvider i18n={i18next}>
      <GuidePage />
    </I18nextProvider>,
  );
}

describe('GuidePage — in-app οδηγός', () => {
  it('δείχνει τον τίτλο και ανοίγει την πρώτη ενότητα', () => {
    renderGuide();
    expect(screen.getByRole('heading', { name: 'User guide' })).toBeTruthy();
    const open = screen.getByRole('button', { name: 'Log a workout' });
    expect(open.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('region', { name: 'Log a workout' })).toBeTruthy();
  });

  it('accordion: κλείνει και ξανανοίγει με το ίδιο κουμπί', () => {
    renderGuide();
    const toggle = screen.getByRole('button', { name: 'Log a workout' });
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'Log a workout' })).toBeNull();
    fireEvent.click(toggle);
    expect(screen.getByRole('region', { name: 'Log a workout' })).toBeTruthy();
  });

  it('αναζήτηση φιλτράρει ενότητες και δείχνει κενό state', () => {
    renderGuide();
    const search = screen.getByRole('textbox', { name: 'Search the guide' });
    fireEvent.change(search, { target: { value: 'backup' } });
    expect(screen.getByRole('button', { name: 'Backup, import, CSV and deletion' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log a workout' })).toBeNull();

    fireEvent.change(search, { target: { value: 'zzzz-not-found' } });
    expect(screen.getByText('Nothing matches. Try another word.')).toBeTruthy();
  });

  it('περιλαμβάνει τις νέες ενότητες paste, home, skills, activities και tricks', () => {
    renderGuide();
    const search = screen.getByRole('textbox', { name: 'Search the guide' });
    for (const [term, title] of [
      ['tricks', 'Quick tricks'],
      ['paste', 'Quick paste notes'],
      ['home', 'Home in one tap'],
      ['skills', 'Skills and progressions'],
      ['activities', 'Activities (run, bike, swim…)'],
    ] as const) {
      fireEvent.change(search, { target: { value: term } });
      expect(screen.getByRole('button', { name: title })).toBeTruthy();
    }
  });

  it('κάθε label και κάθε guide key υπάρχει σε EN και EL', () => {
    const guideKeys = new Set<string>();
    const labelKeys = new Set<string>();
    for (const section of GUIDE_SECTIONS) {
      guideKeys.add(section.titleKey);
      guideKeys.add(section.introKey);
      for (const key of section.stepKeys) guideKeys.add(key);
      if (section.noteKey) guideKeys.add(section.noteKey);
      for (const key of section.labelKeys) labelKeys.add(key);
    }
    for (const key of [
      'guide.eyebrow',
      'guide.title',
      'guide.subtitle',
      'guide.searchLabel',
      'guide.searchPlaceholder',
      'guide.noResults',
      'guide.buttonsHeading',
      'guide.quickExamples',
      'guide.pasteExamples',
    ]) {
      guideKeys.add(key);
    }

    for (const key of [...guideKeys, ...labelKeys]) {
      expect(hasPath(en, key), `EN missing ${key}`).toBe(true);
      expect(hasPath(el, key), `EL missing ${key}`).toBe(true);
    }
    // Τα labels δεν είναι ελεύθερο κείμενο: δείχνουν σε πραγματικά namespaces.
    for (const key of labelKeys) expect(key.startsWith('guide.')).toBe(false);
  });

  it('τα παραδείγματα του οδηγού περνούν από τους πραγματικούς parsers', () => {
    for (const example of QUICK_LOG_EXAMPLES) {
      expect(parseQuickSets(example, true, 'kg').length, example).toBeGreaterThan(0);
    }
    const parsed = parseWorkoutNotes(PASTE_EXAMPLES.join('\n'), SEED_EXERCISES, 'kg');
    expect(parsed).toHaveLength(PASTE_EXAMPLES.length);
    for (const line of parsed) {
      expect(line.matchedExerciseId, line.rawLine).toBeTruthy();
      expect(line.sets.length, line.rawLine).toBeGreaterThan(0);
    }
  });
});
