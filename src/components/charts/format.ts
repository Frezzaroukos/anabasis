/**
 * Συμπαγής αριθμός για άξονες/συνόψεις: 850 → "850", 1 250 → "1.3k",
 * 12 400 → "12k". Ποτέ «0k» για μικρούς όγκους (το παλιό
 * `Math.round(v / 1000) + 'k'` έδειχνε 0k για 400 kg).
 */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 10_000) return `${Math.round(value / 1000)}k`;
  if (abs >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(Math.round(value));
}
