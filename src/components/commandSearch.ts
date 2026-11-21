/**
 * Pure search helpers για την command palette.
 *
 * Ζουν χωριστά από το UI ώστε το (lazy) dialog chunk να μη χρειάζεται να
 * φορτώσει τίποτα άλλο, και ώστε το provider (eager, για το Ctrl+K listener)
 * να μπορεί να τα re-export-άρει χωρίς να τραβά το βαρύ dialog.
 */

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[’']/g, '');
}

function scoreToken(token: string, haystack: string): number {
  const direct = haystack.indexOf(token);
  if (direct >= 0) {
    const atWordStart = direct === 0 || /[\s\-_/(]/.test(haystack[direct - 1]!);
    return 100 + (atWordStart ? 20 : 0) - Math.min(direct, 40);
  }

  let queryIndex = 0;
  let streak = 0;
  let score = 0;
  for (let i = 0; i < haystack.length && queryIndex < token.length; i += 1) {
    if (haystack[i] !== token[queryIndex]) {
      streak = 0;
      continue;
    }
    score += 1 + streak * 2;
    if (i === 0 || /[\s\-_/(]/.test(haystack[i - 1]!)) score += 3;
    streak += 1;
    queryIndex += 1;
  }
  return queryIndex === token.length ? score : 0;
}

export function fuzzyScore(query: string, text: string): number {
  const normalizedQuery = normalizeSearch(query).trim();
  if (!normalizedQuery) return 1;
  const haystack = normalizeSearch(text);
  let total = 0;
  for (const token of normalizedQuery.split(/\s+/)) {
    const tokenScore = scoreToken(token, haystack);
    if (tokenScore === 0) return 0;
    total += tokenScore;
  }
  return total;
}
