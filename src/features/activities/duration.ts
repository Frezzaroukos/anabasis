/** Ανώτατη διάρκεια χειροκίνητης καταγραφής — 24 ώρες. */
export const MAX_DURATION_SECONDS = 24 * 60 * 60;

/**
 * Δέχεται «25» (λεπτά), «25:30» (λεπτά:δευτερόλεπτα) ή «1:05:00»
 * (ώρες:λεπτά:δευτερόλεπτα). Επιστρέφει null για κενό/άκυρο — ο caller
 * ξεχωρίζει κενό από άκυρο. Αρνείται αρνητικά, 0, δεκαδικά και >24h.
 */
export function parseDurationInput(raw: string): number | null {
  const value = raw.trim();
  if (!value) return null;
  if (!/^\d+(?::\d{1,2}){0,2}$/.test(value)) return null;
  const parts = value.split(':').map(Number);
  if (parts.some((part) => !Number.isInteger(part) || part < 0)) return null;
  if (parts.length >= 2 && parts[parts.length - 1]! >= 60) return null;
  if (parts.length === 3 && parts[1]! >= 60) return null;
  const seconds =
    parts.length === 1
      ? parts[0]! * 60
      : parts.length === 2
        ? parts[0]! * 60 + parts[1]!
        : parts[0]! * 3600 + parts[1]! * 60 + parts[2]!;
  if (seconds <= 0 || seconds > MAX_DURATION_SECONDS) return null;
  return seconds;
}

/** Αντίστροφο του parse: «25:00» ή «1:05:00» (ποτέ σκέτο «25»). */
export function formatDurationInput(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
}
