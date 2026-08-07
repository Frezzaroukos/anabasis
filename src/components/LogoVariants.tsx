/**
 * Υποψήφια logos για το Anabasis — όλα γύρω από το θέμα «ανάβαση προς κορυφή».
 * currentColor ώστε να παίρνουν το accent. Ο χρήστης διαλέγει από /branding.
 * Όποιο κρατήσουμε γίνεται favicon/PWA/UI/OG.
 */

/** V1 — Το τρέχον: κλιμακωτή γραμμή προς κορυφή-σημείο. Καθαρό, minimal. */
export function LogoStair({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis">
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

/** V2 — Βουνό/κορυφή από σκαλοπάτια: πιο «peak», με φωτεινή κορυφή. */
export function LogoPeak({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis">
      {/* πλαγιά ως σκαλοπάτια που ανεβαίνουν στην κορυφή */}
      <path
        d="M96 416 L176 416 L176 336 L232 336 L232 256 L288 256 L288 176 L344 176 L344 336 L400 336 L400 416 L416 416"
        fill="none"
        stroke="currentColor"
        strokeWidth={30}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
      {/* κορυφή = σημείο επίτευξης */}
      <circle cx={288} cy={120} r={26} fill="currentColor" />
      <path d="M288 146 L288 176" stroke="currentColor" strokeWidth={30} strokeLinecap="round" />
    </svg>
  );
}

/** V3 — Μονόγραμμα «Α» χτισμένο από ανοδικά chevrons (άνοδος + αρχικό). */
export function LogoAlpha({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 512 512" className={className} role="img" aria-label="Anabasis">
      {/* τρία chevrons που ανεβαίνουν = πρόοδος, σχηματίζουν κορυφή «Λ/Α» */}
      <path d="M136 392 L256 232 L376 392" fill="none" stroke="currentColor" strokeWidth={34} strokeLinecap="round" strokeLinejoin="round" />
      <path d="M180 392 L332 392" fill="none" stroke="currentColor" strokeWidth={34} strokeLinecap="round" opacity={0.55} />
      <circle cx={256} cy={168} r={28} fill="currentColor" />
    </svg>
  );
}

export const LOGO_VARIANTS = [
  { key: 'stair', label: 'Ascent (current)', Comp: LogoStair },
  { key: 'peak', label: 'Peak', Comp: LogoPeak },
  { key: 'alpha', label: 'Alpha', Comp: LogoAlpha },
] as const;
