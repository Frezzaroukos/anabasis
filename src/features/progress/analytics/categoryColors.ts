/** Σταθερά χρώματα κατηγοριών — ίδια σε chart/legend, ορατά σε dark/light. */
const CATEGORY_COLORS: Record<string, string> = {
  push: 'hsl(var(--primary))',
  pull: 'hsl(var(--gold))',
  legs: 'hsl(160 60% 45%)',
  core: 'hsl(200 70% 55%)',
  other: 'hsl(var(--muted-foreground))',
};

export function categoryColor(category: string): string {
  return CATEGORY_COLORS[category] ?? 'hsl(var(--muted-foreground))';
}
