import { useId } from 'react';
import markSvg from '../../branding/logo-v2/mark.svg?raw';
import { cn } from '@/lib/utils';

/**
 * Το σήμα του Anabasis v5 — «Ascent A»: το γράμμα A ως ανάβαση, με μια
 * violet διαδρομή που ανεβαίνει από τη βάση στην κορυφή.
 *
 * Η γεωμετρία ζει στο `branding/logo-v2/mark.svg` (ίδια πηγή με τα app
 * icons/favicon). Το `currentColor` κρατά το A προσαρμοστικό στο accent του
 * χρήστη· η διαδρομή μένει brand violet. `summit` βάζει χρυσή κουκκίδα στην
 * κορυφή (= PR/achievement). `gradient` δίνει signature violet gradient στη
 * διαδρομή για splash/branding.
 */
const MARK_PATHS = [...markSvg.matchAll(/<path[^>]*\sd="([^"]+)"/g)].map((m) => m[1]);
const [DARK_PATH, PURPLE_PATH] = MARK_PATHS;

export function Logo({
  className,
  summit = false,
  gradient = false,
}: {
  className?: string;
  /** Χρυσή κουκκίδα στην κορυφή (= PR/achievement). */
  summit?: boolean;
  /** Signature violet gradient στη διαδρομή — brand-fixed χρήση. */
  gradient?: boolean;
}) {
  const gradientId = useId();
  const routePaint = gradient ? `url(#${gradientId})` : 'hsl(var(--primary))';

  return (
    <svg viewBox="0 0 64 64" className={cn('h-6 w-6', className)} role="img" aria-label="Anabasis">
      {gradient ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#8239EF" />
            <stop offset="1" stopColor="#B88CFF" />
          </linearGradient>
        </defs>
      ) : null}
      <g transform="translate(0,64) scale(0.00962406,-0.00962406)">
        <path d={DARK_PATH} fill="currentColor" />
        <path d={PURPLE_PATH} fill={routePaint} />
      </g>
      {summit ? <circle cx="32" cy="5" r="3.5" fill="hsl(var(--gold))" /> : null}
    </svg>
  );
}

/** Λογότυπο + όνομα — για headers. Το wordmark είναι tracked, σαν το brand sheet. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Logo className="h-6 w-6 text-primary" />
      <span className="font-display text-base font-semibold uppercase tracking-[0.18em]">
        Anabasis
      </span>
    </span>
  );
}
