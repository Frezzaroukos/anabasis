import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Το σήμα του Anabasis v3 — «Summit seal»: οροσειρά μέσα σε κυκλική σφραγίδα.
 * Αίσθηση ορειβατικού συλλόγου / badge — σοβαρό, διαχρονικό, ταιριάζει με το
 * Carbon. Ο δακτύλιος «περικλείει» την ανάβαση· η ψηλότερη κορυφή είναι το
 * σημείο-στόχος. Δουλεύει σε 16px favicon: δακτύλιος + 2 κορυφές διαβάζονται.
 *
 * Χρώμα: `currentColor` by default — το σήμα ακολουθεί το accent του χρήστη
 * (Ρυθμίσεις → Accent). `summit` βάζει χρυσό «σημαιάκι» στην κορυφή
 * (= PR/achievement). `gradient` δίνει brand-fixed accent gradient για
 * splash/branding όπου δεν πρέπει να αλλάζει με το accent.
 */
const MOUNTAINS = 'M15 43 L25 27 L31 35 L39 21 L49 43 Z';
const SUMMIT = { x: 39, y: 21 } as const;

export function Logo({
  className,
  summit = false,
  gradient = false,
}: {
  className?: string;
  /** Χρυσό σημαιάκι στην κορυφή (= PR/achievement). */
  summit?: boolean;
  /** Signature accent gradient αντί για currentColor — brand-fixed χρήση. */
  gradient?: boolean;
}) {
  const gradientId = useId();
  const paint = gradient ? `url(#${gradientId})` : 'currentColor';

  return (
    <svg viewBox="0 0 64 64" className={cn('h-6 w-6', className)} role="img" aria-label="Anabasis">
      {gradient ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#5EE6D9" />
            <stop offset="1" stopColor="#9D5CFF" />
          </linearGradient>
        </defs>
      ) : null}
      {/* Δακτύλιος-σφραγίδα */}
      <circle cx="32" cy="32" r="26" fill="none" stroke={paint} strokeWidth="4.5" />
      {/* Οροσειρά */}
      <path d={MOUNTAINS} fill={paint} />
      {summit ? <circle cx={SUMMIT.x} cy={SUMMIT.y} r="4" fill="hsl(var(--gold))" /> : null}
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
