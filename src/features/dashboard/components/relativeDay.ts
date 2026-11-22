/** Πλήρεις τοπικές μέρες από ένα ISO timestamp μέχρι το `now`. Αρνητικό = μέλλον. */
export function daysBetween(iso: string, now = new Date()): number {
  const d = new Date(iso);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  return Math.round((startOf(now) - startOf(d)) / 86_400_000);
}

type RelativeT = (key: string, opts?: { count: number }) => string;

/**
 * «Σήμερα / Χθες / 3 μέρες πριν» — μετά τις 7 μέρες, σύντομη ημερομηνία.
 * Τα κείμενα έρχονται από i18n· πριν το «Χθες» ήταν καρφωμένο στον κώδικα.
 */
export function relativeDayLabel(
  iso: string,
  t: RelativeT,
  locale: string,
  now = new Date(),
): string {
  const days = daysBetween(iso, now);
  if (days <= 0) return t('dashboard.relative.today');
  if (days === 1) return t('dashboard.relative.yesterday');
  if (days < 7) return t('dashboard.relative.daysAgo', { count: days });
  return new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}
