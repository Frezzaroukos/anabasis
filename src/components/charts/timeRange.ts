/**
 * Κοινή πηγή αλήθειας για το χρονικό εύρος των charts (ARCHITECTURE-V4 §7):
 * 1M/3M/6M/1Y/All — οι μέρες πίσω από κάθε επιλογή ΚΑΙ η πυκνότητα των ticks.
 * Ξεχωριστό module από το component ώστε τα consumers να παίρνουν σταθερές/
 * helpers χωρίς να «σπάει» το React Fast Refresh του selector.
 */
export const CHART_RANGE_KEYS = ['1M', '3M', '6M', '1Y', 'ALL'] as const;
export type ChartRangeKey = (typeof CHART_RANGE_KEYS)[number];

export const CHART_RANGE_DAYS: Record<ChartRangeKey, number> = {
  '1M': 30,
  '3M': 90,
  '6M': 180,
  '1Y': 365,
  ALL: 3650,
};

export const CHART_RANGE_LABEL_KEY: Record<ChartRangeKey, string> = {
  '1M': 'progress.range.1m',
  '3M': 'progress.range.3m',
  '6M': 'progress.range.6m',
  '1Y': 'progress.range.1y',
  ALL: 'progress.range.all',
};

/** Recharts `interval` ώστε ο άξονας να μην πλημμυρίζει σε μεγάλα εύρη. */
export function tickIntervalFor(range: ChartRangeKey, pointCount: number): number {
  const targetTicks = range === '1M' ? 6 : range === '3M' ? 6 : 8;
  if (pointCount <= targetTicks) return 0;
  return Math.ceil(pointCount / targetTicks) - 1;
}

/**
 * `YYYY-MM-DD` → Date στις 12:00 ΤΟΠΙΚΗ ώρα. Το `new Date('2026-11-22')`
 * διαβάζεται ως UTC· σε ζώνη πίσω από το UTC (ή με DST) η ετικέτα δείχνει
 * την προηγούμενη μέρα. Το μεσημέρι είναι ασφαλές και στις δύο κατευθύνσεις.
 */
export function localNoon(isoDay: string): Date {
  return new Date(`${isoDay.slice(0, 10)}T12:00:00`);
}

/** Μορφή ημερομηνίας στον άξονα: μέρα/μήνας για κοντινά, μήνας/έτος για μεγάλα. */
export function tickFormatterFor(range: ChartRangeKey): (isoDate: string) => string {
  if (range === '1M' || range === '3M') return (d: string) => d.slice(5);
  return (d: string) => localNoon(d).toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
}
