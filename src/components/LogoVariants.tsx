import { Logo } from './Logo';

/**
 * Ιστορικό & εναλλακτικές του σήματος — φαίνονται στο /branding.
 * Το ενεργό σήμα ζει στο `Logo.tsx`· εδώ κρατάμε τα υπόλοιπα για σύγκριση
 * ώστε μια μελλοντική αλλαγή να γίνεται με μάτια, όχι από μνήμη.
 */

/** V2 — ΤΟ ΕΝΕΡΓΟ: προοδευτική σκάλα + μάζα + χρυσή κορυφή. */
export function LogoAscent({ className }: { className?: string }) {
  return <Logo className={className} summit />;
}

/** V1 — Το πρώτο draft: λεπτή κλιμακωτή γραμμή με κουκκίδα. Πολύ «stock icon». */
export function LogoStairV1({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis v1">
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

/** V2b — Ίδια γεωμετρία, χωρίς μάζα: για stamps/watermarks σε ένα επίπεδο. */
export function LogoAscentFlat({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis flat">
      <path
        d="M60 404 H144 V348 H228 V280 H312 V198 H396 V100 H452"
        fill="none"
        stroke="currentColor"
        strokeWidth={46}
        strokeLinecap="butt"
        strokeLinejoin="miter"
      />
    </svg>
  );
}

/** V3 — Μονόγραμμα «Λ/Α» από ανοδικά chevrons (απορρίφθηκε: γενικό). */
export function LogoAlpha({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis alpha">
      <path d="M136 392 L256 232 L376 392" fill="none" stroke="currentColor" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M180 392 L332 392" fill="none" stroke="currentColor" strokeWidth={34} strokeLinecap="round" opacity={0.55} />
      <circle cx={256} cy={168} r={28} fill="currentColor" />
    </svg>
  );
}

export const LOGO_VARIANTS = [
  { key: 'ascent', label: 'Ascent (ενεργό)', Comp: LogoAscent },
  { key: 'ascent-flat', label: 'Ascent — flat', Comp: LogoAscentFlat },
  { key: 'stair-v1', label: 'v1 draft', Comp: LogoStairV1 },
  { key: 'alpha', label: 'Alpha (απορρίφθηκε)', Comp: LogoAlpha },
] as const;
