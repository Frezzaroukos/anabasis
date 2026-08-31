import { cn } from '@/lib/utils';

/**
 * Ταξινομικό badge κατηγορίας — ΕΝΑ source για το χρώμα κάθε κατηγορίας, αντί
 * για γυμνή χρωματιστή κουκκίδα σκορπισμένη σε πολλά αρχεία. Χρωματιστό κείμενο
 * σε αχνό χρωματιστό φόντο: διαβάζεται ως εσκεμμένη ταξινόμηση, όχι διακόσμηση,
 * και δεν στηρίζεται ΜΟΝΟ στο χρώμα (το ίδιο το όνομα είναι το σήμα → a11y).
 *
 * Οι κατηγορίες skill (`lower/mixed`) κανονικοποιούνται στις αντίστοιχες των
 * exercises ώστε «Planche» και push ασκήσεις να μοιράζονται χρώμα.
 */
const CATEGORY_TONE: Record<string, { text: string; bg: string }> = {
  push: { text: 'text-category-push', bg: 'bg-category-push/12' },
  pull: { text: 'text-category-pull', bg: 'bg-category-pull/12' },
  legs: { text: 'text-category-legs', bg: 'bg-category-legs/12' },
  core: { text: 'text-category-core', bg: 'bg-category-core/12' },
  mixed: { text: 'text-category-mixed', bg: 'bg-category-mixed/12' },
};

/** skill → exercise category (ίδιο mapping με το normalizeSkillCategory). */
const CATEGORY_ALIAS: Record<string, string> = {
  lower: 'legs',
  other: 'mixed',
};

function toneKey(category: string): string {
  const key = CATEGORY_ALIAS[category] ?? category;
  return key in CATEGORY_TONE ? key : 'mixed';
}

export function CategoryBadge({
  category,
  className,
}: {
  category: string;
  className?: string;
}) {
  const tone = CATEGORY_TONE[toneKey(category)]!;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        tone.text,
        tone.bg,
        className,
      )}
    >
      {category}
    </span>
  );
}
