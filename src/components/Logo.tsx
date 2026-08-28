import { useId } from 'react';
import { cn } from '@/lib/utils';

/**
 * Το σήμα του Anabasis v2 — «rung-peak»: 4 σκαλοπάτια/rungs στοιβαγμένα σε
 * σιλουέτα κορυφής. Διπλή ανάγνωση: σκάλα (κάθε skill = σκαλί) ΚΑΙ βουνό
 * (η ανάβαση) — τα κενά ανάμεσα στα rungs σχηματίζουν την κορυφή στο
 * negative space. Πηγή γεωμετρίας: branding/logo-v2/mark.svg (viewBox 64).
 * Δουλεύει σε 16px favicon χωρίς να κλείνει: 4 καθαρές οριζόντιες μπάρες.
 *
 * Χρώμα: `currentColor` by default — έτσι το σήμα ακολουθεί το accent του
 * χρήστη μέσα στο app (Ρυθμίσεις → Accent), όπως έκανε πάντα. Το `gradient`
 * ενεργοποιεί το signature Altitude Violet gradient (#7C3AED→#B88CFF) για
 * brand-fixed πλαίσια (branding showcase, splash) όπου δεν πρέπει να αλλάζει
 * με το accent του χρήστη.
 */
const RUNGS = [
  { x: 28, y: 9, w: 8 },
  { x: 21, y: 22, w: 22 },
  { x: 14, y: 35, w: 36 },
  { x: 7, y: 48, w: 50 },
] as const;
const RUNG_H = 7;
const RUNG_RX = 3.5;

export function Logo({
  className,
  summit = false,
  gradient = false,
}: {
  className?: string;
  /** Χρυσή κορυφή (= PR/achievement). Μόνο η κορυφαία (μικρότερη) ράβδος. */
  summit?: boolean;
  /** Signature violet gradient αντί για currentColor — brand-fixed χρήση. */
  gradient?: boolean;
}) {
  const gradientId = useId();
  const fill = gradient ? `url(#${gradientId})` : 'currentColor';

  return (
    <svg viewBox="0 0 64 64" className={cn('h-6 w-6', className)} role="img" aria-label="Anabasis">
      {gradient ? (
        <defs>
          <linearGradient id={gradientId} x1="0" y1="1" x2="0" y2="0">
            <stop offset="0" stopColor="#7C3AED" />
            <stop offset="1" stopColor="#B88CFF" />
          </linearGradient>
        </defs>
      ) : null}
      <g>
        {RUNGS.map((r, i) => (
          <rect
            key={r.y}
            x={r.x}
            y={r.y}
            width={r.w}
            height={RUNG_H}
            rx={RUNG_RX}
            fill={summit && i === 0 ? 'hsl(var(--gold))' : fill}
          />
        ))}
      </g>
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
