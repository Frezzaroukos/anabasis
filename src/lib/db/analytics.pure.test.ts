import { describe, expect, it } from 'vitest';
import {
  buildCategoryDistribution,
  buildPRTimeline,
  buildWeeklyFrequency,
  buildWeeklyVolume,
  isWorkingSet,
  mondayOfDay,
  weekStarts,
  type AnalyticsSetRow,
} from './analytics';

/**
 * Καθαρά μαθηματικά των analytics charts — χωρίς Dexie.
 * Σταθερή «σήμερα»: 2026-08-31 (Δευτέρα) ώστε οι εβδομάδες να είναι
 * προβλέψιμες ανεξάρτητα από τη μέρα που τρέχουν τα tests.
 */
const TODAY = new Date(2026, 7, 31, 12);

function set(partial: Partial<AnalyticsSetRow> = {}): AnalyticsSetRow {
  return {
    exerciseId: 'ex-1',
    workoutId: 'w-1',
    date: '2026-08-31',
    weightKg: 100,
    bodyweightKg: null,
    reps: 5,
    restPauseReps: [],
    isWarmup: false,
    setType: 'normal',
    ...partial,
  };
}

describe('weekStarts / mondayOfDay', () => {
  it('επιστρέφει Δευτέρες, με τελευταία την τρέχουσα εβδομάδα', () => {
    expect(weekStarts(3, TODAY)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31']);
  });

  it('η Κυριακή ανήκει στην εβδομάδα της προηγούμενης Δευτέρας', () => {
    expect(mondayOfDay('2026-08-30')).toBe('2026-08-24');
    expect(mondayOfDay('2026-08-31')).toBe('2026-08-31');
  });

  it('ελάχιστο μία εβδομάδα ακόμα και με 0/αρνητικό όρισμα', () => {
    expect(weekStarts(0, TODAY)).toEqual(['2026-08-31']);
    expect(weekStarts(-5, TODAY)).toEqual(['2026-08-31']);
  });
});

describe('isWorkingSet', () => {
  it('αποκλείει warm-up και από τα δύο πεδία', () => {
    expect(isWorkingSet({ isWarmup: true, setType: 'normal' })).toBe(false);
    expect(isWorkingSet({ isWarmup: false, setType: 'warmup' })).toBe(false);
    expect(isWorkingSet({ isWarmup: false, setType: 'normal' })).toBe(true);
  });
});

describe('buildWeeklyVolume', () => {
  it('κενά δεδομένα → μία μηδενική εβδομάδα ανά εβδομάδα του εύρους', () => {
    const points = buildWeeklyVolume([], 2, TODAY);
    expect(points).toEqual([
      { weekStart: '2026-08-24', volume: 0, sets: 0 },
      { weekStart: '2026-08-31', volume: 0, sets: 0 },
    ]);
  });

  it('όγκος = (πρόσθετο + σωματικό βάρος) × reps — το BW μετράει ως φορτίο', () => {
    const points = buildWeeklyVolume(
      [
        set({ weightKg: 20, bodyweightKg: 72, reps: 5 }), // 92 × 5 = 460
        set({ weightKg: null, bodyweightKg: 80, reps: 10 }), // 80 × 10 = 800
      ],
      1,
      TODAY,
    );
    expect(points[0]).toEqual({ weekStart: '2026-08-31', volume: 1260, sets: 2 });
  });

  it('τα rest-pause mini-sets προσμετρώνται στις επαναλήψεις', () => {
    const points = buildWeeklyVolume(
      [set({ weightKg: 100, bodyweightKg: null, reps: 5, restPauseReps: [2, 1] })],
      1,
      TODAY,
    );
    expect(points[0]!.volume).toBe(800); // 100 × 8
  });

  it('αγνοεί warm-up είτε το flag είτε το set_type το δηλώνει', () => {
    const points = buildWeeklyVolume(
      [
        set({ isWarmup: true, weightKg: 999, reps: 99 }),
        set({ setType: 'warmup', weightKg: 999, reps: 99 }),
        set({ weightKg: 50, reps: 5 }),
      ],
      1,
      TODAY,
    );
    expect(points[0]).toEqual({ weekStart: '2026-08-31', volume: 250, sets: 1 });
  });

  it('η Κυριακή μπαίνει στην προηγούμενη εβδομάδα, όχι στην τρέχουσα', () => {
    const points = buildWeeklyVolume(
      [set({ date: '2026-08-30', weightKg: 100, reps: 1 })],
      2,
      TODAY,
    );
    expect(points.map((p) => p.volume)).toEqual([100, 0]);
  });
});

describe('buildWeeklyFrequency', () => {
  it('μετρά μοναδικές προπονήσεις ανά εβδομάδα και γεμίζει κενά με 0', () => {
    const points = buildWeeklyFrequency(
      [
        { id: 'w1', date: '2026-08-31' },
        { id: 'w2', date: '2026-09-01' },
        { id: 'w1', date: '2026-08-31' }, // duplicate id δεν διπλομετρά
        { id: 'w3', date: '2026-08-20' }, // εκτός εύρους
      ],
      2,
      TODAY,
    );
    expect(points).toEqual([
      { weekStart: '2026-08-24', sessions: 0 },
      { weekStart: '2026-08-31', sessions: 2 },
    ]);
  });
});

describe('buildCategoryDistribution', () => {
  const exercises = [
    { id: 'pull-1', category: 'pull' },
    { id: 'push-1', category: 'push' },
  ];

  it('ομαδοποιεί ανά κατηγορία, ταξινομεί κατά πλήθος σετ και βάζει τα άγνωστα στο other', () => {
    const slices = buildCategoryDistribution(
      [
        set({ exerciseId: 'pull-1', weightKg: 10, reps: 10 }),
        set({ exerciseId: 'pull-1', weightKg: 10, reps: 10 }),
        set({ exerciseId: 'push-1', weightKg: 20, reps: 5 }),
        set({ exerciseId: 'gone', weightKg: 10, reps: 5 }),
        set({ exerciseId: 'push-1', isWarmup: true, weightKg: 999, reps: 99 }),
      ],
      exercises,
    );
    expect(slices).toEqual([
      { category: 'pull', sets: 2, volume: 200 },
      { category: 'push', sets: 1, volume: 100 },
      { category: 'other', sets: 1, volume: 50 },
    ]);
  });

  it('κενά δεδομένα → κενή λίστα', () => {
    expect(buildCategoryDistribution([], exercises)).toEqual([]);
  });
});

describe('buildPRTimeline', () => {
  it('σωρευτικά ανά ημέρα, ταξινομημένα, με φίλτρο εύρους', () => {
    const points = buildPRTimeline(
      [
        { date: '2026-09-01', type: 'max_weight', name: 'Pull-up' },
        { date: '2026-08-30', type: 'e1rm', name: 'Dip' },
        { date: '2026-09-01', type: 'max_reps', name: 'Push-up' },
      ],
      '2026-08-31',
    );
    expect(points).toHaveLength(1);
    expect(points[0]!.cumulative).toBe(2);
    expect(points[0]!.events.map((e) => e.type)).toEqual(['max_reps', 'max_weight']);
  });

  it('κενά δεδομένα → κενή λίστα', () => {
    expect(buildPRTimeline([])).toEqual([]);
  });
});

import { buildTrainingHeatmap, buildWeeklyCategorySets } from './analytics';

describe('buildWeeklyCategorySets', () => {
  const exercises = [
    { id: 'ex-1', category: 'push' },
    { id: 'ex-2', category: 'pull' },
  ];
  it('stack ανά κατηγορία/εβδομάδα, εξαιρεί warm-ups, κρατά κενές εβδομάδες', () => {
    const rows = [
      set({ exerciseId: 'ex-1', date: '2026-08-31' }),
      set({ exerciseId: 'ex-1', date: '2026-08-31' }),
      set({ exerciseId: 'ex-2', date: '2026-08-25' }),
      set({ exerciseId: 'ex-2', date: '2026-08-31', isWarmup: true }),
      set({ exerciseId: 'ex-2', date: '2026-08-31', setType: 'warmup' }),
      set({ exerciseId: 'gone', date: '2026-08-31' }),
    ];
    const pts = buildWeeklyCategorySets(rows, exercises, 3, TODAY);
    expect(pts.map((p) => p.weekStart)).toEqual(['2026-08-17', '2026-08-24', '2026-08-31']);
    expect(pts[0]!.total).toBe(0);
    expect(pts[1]!.byCategory).toEqual({ pull: 1 });
    expect(pts[2]!.byCategory).toEqual({ push: 2, other: 1 });
    expect(pts[2]!.total).toBe(3);
  });
});

describe('buildTrainingHeatmap', () => {
  it('ξεκινά Δευτέρα, σταματά σήμερα, μετρά πολλές προπονήσεις/μέρα και δεν διπλομετρά id', () => {
    // σήμερα Τετάρτη 2026-09-02, 2 εβδομάδες → από Δευτέρα 2026-08-24
    const today = new Date(2026, 8, 2, 23, 30);
    const days = buildTrainingHeatmap(
      [
        { id: 'a', date: '2026-08-24' },
        { id: 'b', date: '2026-09-02' },
        { id: 'c', date: '2026-09-02' },
        { id: 'c', date: '2026-09-02' },
      ],
      2,
      today,
    );
    expect(days[0]!.date).toBe('2026-08-24');
    expect(days.at(-1)!.date).toBe('2026-09-02');
    expect(days).toHaveLength(10);
    expect(days[0]!.sessions).toBe(1);
    expect(days.at(-1)!.sessions).toBe(2);
    expect(days.filter((d) => d.sessions > 0)).toHaveLength(2);
  });
});

import { buildBodyVsStrength } from './analytics';

describe('buildBodyVsStrength', () => {
  it('κοινός δείκτης: πρώτη τιμή κάθε σειράς = 100, union ημερών, null όπου λείπει σημείο', () => {
    const out = buildBodyVsStrength(
      [
        { date: '2026-01-01', value: 100 },
        { date: '2026-01-15', value: 120 },
      ],
      [
        { date: '2026-01-01', value: 80 },
        { date: '2026-01-08', value: 84 },
        { date: '2026-01-15', value: 80 },
      ],
    );
    expect(out.map((p) => p.date)).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
    expect(out[0]).toMatchObject({ strengthIdx: 100, bodyIdx: 100, strength: 100, body: 80 });
    expect(out[1]).toMatchObject({ strengthIdx: null, bodyIdx: 105, strength: null });
    expect(out[2]).toMatchObject({ strengthIdx: 120, bodyIdx: 100 });
  });
  it('λιγότερα από 2 σημεία σε κάποια σειρά → κενό (καμία σύγκριση)', () => {
    expect(
      buildBodyVsStrength([{ date: '2026-01-01', value: 100 }], [
        { date: '2026-01-01', value: 80 },
        { date: '2026-01-02', value: 81 },
      ]),
    ).toEqual([]);
    expect(buildBodyVsStrength([], [])).toEqual([]);
  });
  it('αγνοεί μη-θετικές τιμές και δεν εξαρτάται από τη σειρά εισόδου', () => {
    const out = buildBodyVsStrength(
      [
        { date: '2026-02-01', value: 110 },
        { date: '2026-01-01', value: 100 },
        { date: '2026-01-05', value: 0 },
      ],
      [
        { date: '2026-02-01', value: 79 },
        { date: '2026-01-01', value: 80 },
      ],
    );
    expect(out[0]!.strengthIdx).toBe(100);
    expect(out.at(-1)!.strengthIdx).toBe(110);
  });
});
