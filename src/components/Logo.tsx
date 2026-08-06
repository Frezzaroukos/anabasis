import { cn } from '@/lib/utils';

/**
 * Το σήμα του Anabasis: κλιμακωτή γραμμή που ανεβαίνει προς μια κορυφή —
 * κάθε skill/PR είναι ένα σκαλί. Χρυσό accent = η κατάκτηση. Ίδιο σχήμα με
 * το favicon/logo.svg ώστε το app να αναγνωρίζεται παντού.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('h-6 w-6', className)}
      role="img"
      aria-label="Anabasis"
    >
      <path
        d="M72 400 H168 V320 H264 V240 H360 V160 H440"
        fill="none"
        stroke="currentColor"
        strokeWidth={38}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx={440} cy={160} r={30} fill="currentColor" />
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
