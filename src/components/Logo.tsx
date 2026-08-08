import { cn } from '@/lib/utils';

/**
 * Το σήμα του Anabasis.
 *
 * Δύο επίπεδα, μία ιδέα:
 *  1. Η **σκάλα** (stroke, currentColor) — η διαδρομή· κάθε skill/PR ένα σκαλί.
 *     Τα σκαλιά ΨΗΛΩΝΟΥΝ καθώς ανεβαίνεις (56→68→82→98 units): progressive
 *     overload, όχι μηχανική επανάληψη.
 *  2. Η **μάζα** από κάτω (30% opacity) — ο όγκος της δουλειάς που έχει γίνει.
 *     Δίνει βάρος ώστε να μη διαβάζεται ως γενικό εικονίδιο γραφήματος.
 *
 * Το τελευταίο σκαλί μπορεί να βαφτεί χρυσό (`summit`) — το χρυσό στο app
 * σημαίνει πάντα personal record, οπότε η κορυφή του σήματος είναι το PR.
 *
 * Γεωμετρία: viewBox 512, οπτικό κέντρο ελαφρώς πάνω από το γεωμετρικό
 * (y-extent 77..427). Miter joins + butt caps → αρχιτεκτονικό, όχι «φιλικό».
 * Διαβάζεται μέχρι τα 16px.
 */

const STAIR = 'M60 404 H144 V348 H228 V280 H312 V198 H396 V100 H452';
const MASS = 'M37 404 H144 V348 H228 V280 H312 V198 H396 V100 H475 V427 H37 Z';
const STROKE = 46;

export function Logo({
  className,
  summit = false,
}: {
  className?: string;
  /** Βάψε το τελευταίο σκαλί χρυσό (κορυφή = PR). Για app icon / splash. */
  summit?: boolean;
}) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('h-6 w-6', className)}
      role="img"
      aria-label="Anabasis"
    >
      <path d={MASS} fill="currentColor" opacity={0.3} />
      <path
        d={STAIR}
        fill="none"
        stroke="currentColor"
        strokeWidth={STROKE}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
      {summit && (
        <path
          d="M396 100 H452"
          fill="none"
          stroke="hsl(var(--gold))"
          strokeWidth={STROKE}
          strokeLinecap="butt"
        />
      )}
    </svg>
  );
}

/** Λογότυπο + όνομα — για headers. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Logo className="h-6 w-6 text-primary" />
      <span className="text-lg font-semibold tracking-tight">Anabasis</span>
    </span>
  );
}
