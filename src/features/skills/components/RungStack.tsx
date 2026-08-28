import { cn } from '@/lib/utils';

interface RungStackProps {
  /** 0..1 — πόσο γεμάτη είναι η σκάλα. */
  pct: number;
  /** Πόσα «σκαλιά» δείχνει οπτικά — σταθερό, ανεξάρτητο του πραγματικού πλήθους βημάτων. */
  rungs?: number;
  mastered?: boolean;
  className?: string;
}

/**
 * Μίνι σκάλα προόδου — το ίδιο σήμα με τη σελίδα του skill, σε μέγεθος
 * λίστας. Η πρόοδος «χτίζεται» από κάτω προς τα πάνω (σκαλί-σκαλί), όχι μία
 * επίπεδη μπάρα — έτσι η μεταφορά «ανάβαση» φαίνεται ήδη στη λίστα.
 */
export function RungStack({ pct, rungs = 5, mastered = false, className }: RungStackProps) {
  const clamped = Math.min(1, Math.max(0, pct));
  const filled = Math.round(clamped * rungs);

  return (
    <div
      className={cn('flex h-4 w-6 flex-col-reverse gap-0.5', className)}
      role="img"
      aria-label={`${Math.round(clamped * 100)}%`}
    >
      {Array.from({ length: rungs }, (_, i) => (
        <span
          key={i}
          className={cn(
            'h-full flex-1 rounded-[1px] transition-colors',
            i < filled ? (mastered ? 'bg-gold' : 'bg-primary') : 'bg-muted',
          )}
        />
      ))}
    </div>
  );
}
