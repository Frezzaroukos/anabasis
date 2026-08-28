import { Logo } from './Logo';

/**
 * Ιστορικό & εναλλακτικές του σήματος — φαίνονται στο /branding.
 * Το ενεργό σήμα ζει στο `Logo.tsx`· εδώ κρατάμε τα υπόλοιπα για σύγκριση
 * ώστε μια μελλοντική αλλαγή να γίνεται με μάτια, όχι από μνήμη.
 */

/** V4 — ΤΟ ΕΝΕΡΓΟ: «Rung-peak» — 4 σκαλοπάτια σε σιλουέτα κορυφής. */
export function LogoRungPeak({ className }: { className?: string }) {
  return <Logo className={className} />;
}

/** V4 gold — η summit εκδοχή (κορυφαία ράβδος = achievement). */
export function LogoRungPeakSummit({ className }: { className?: string }) {
  return <Logo className={className} summit />;
}

/** V4 gradient — το signature Altitude Violet gradient, brand-fixed. */
export function LogoRungPeakGradient({ className }: { className?: string }) {
  return <Logo className={className} gradient />;
}

/**
 * V3 — Παλαιότερο ενεργό (πριν το v2 redesign): «Άλφα με σκάλα» + χρυσή
 * κορυφή. Standalone γεωμετρία (δεν αγγίζει πλέον το Logo.tsx, που κουβαλά
 * μόνο το τρέχον σήμα) — κρατιέται εδώ μόνο για ιστορική σύγκριση.
 */
export function LogoAlphaLadder({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis v3">
      <g transform="translate(256,256) scale(0.9) translate(-256,-256)">
        <path
          d="M60 452 L256 60 L452 452"
          fill="none"
          stroke="currentColor"
          strokeWidth={48}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        <path d="M256 113.7 L208.8 208 L303.2 208 Z" fill="hsl(var(--gold))" />
        {[
          { x: 194.8, y: 236, w: 122.3 },
          { x: 169.8, y: 286, w: 172.3 },
          { x: 144.8, y: 336, w: 222.3 },
          { x: 119.8, y: 386, w: 272.3 },
        ].map((s) => (
          <rect key={s.y} x={s.x} y={s.y} width={s.w} height={24} rx={2} fill="currentColor" />
        ))}
      </g>
    </svg>
  );
}

/** V3b — Η εκδοχή μικρού μεγέθους (2 σκαλιά) — favicon/16px, ιστορικό. */
export function LogoAlphaLadderSmall({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis v3 small">
      <g transform="translate(256,256) scale(0.9) translate(-256,-256)">
        <path
          d="M60 452 L256 60 L452 452"
          fill="none"
          stroke="currentColor"
          strokeWidth={48}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        <path d="M256 113.7 L194.8 236 L317.2 236 Z" fill="hsl(var(--gold))" />
        {[
          { x: 171.8, y: 282, w: 168.3 },
          { x: 132.8, y: 360, w: 246.3 },
        ].map((s) => (
          <rect key={s.y} x={s.x} y={s.y} width={s.w} height={34} rx={2} fill="currentColor" />
        ))}
      </g>
    </svg>
  );
}

/** V2 — Προοδευτική σκάλα + μάζα. Καλό σήμα, αλλά όχι μονόγραμμα. */
export function LogoAscent({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis v2">
      <path
        d="M37 404 H144 V348 H228 V280 H312 V198 H396 V100 H475 V427 H37 Z"
        fill="currentColor"
        opacity={0.3}
      />
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
  { key: 'rung-peak', label: 'Rung-peak (ενεργό)', Comp: LogoRungPeak },
  { key: 'rung-peak-summit', label: 'Rung-peak — summit (gold)', Comp: LogoRungPeakSummit },
  { key: 'rung-peak-gradient', label: 'Rung-peak — Altitude Violet gradient', Comp: LogoRungPeakGradient },
  { key: 'alpha-ladder', label: 'v3 — Άλφα-σκάλα (ιστορικό)', Comp: LogoAlphaLadder },
  { key: 'alpha-ladder-sm', label: 'v3 — Άλφα-σκάλα μικρό (ιστορικό)', Comp: LogoAlphaLadderSmall },
  { key: 'ascent', label: 'v2 — Ascent', Comp: LogoAscent },
  { key: 'ascent-flat', label: 'v2 — flat', Comp: LogoAscentFlat },
  { key: 'stair-v1', label: 'v1 draft', Comp: LogoStairV1 },
  { key: 'alpha', label: 'Chevron (απορρίφθηκε)', Comp: LogoAlpha },
] as const;
