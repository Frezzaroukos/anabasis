import { cn } from '@/lib/utils';

/**
 * Το σήμα του Anabasis — «Άλφα με σκάλα».
 *
 * Τρία νοήματα σε ένα σχήμα:
 *  1. **Α** — το αρχικό του Ἀνάβασις (και το Λ/Α της κλασικής γεωμετρίας).
 *  2. **Σκάλα** — τα σκαλιά μέσα στο counter· κάθε skill/PR ένα σκαλί ψηλότερα.
 *     Πλαταίνουν καθώς κατεβαίνεις: η βάση είναι πλατιά, η κορυφή στενή.
 *  3. **Κορυφή** — το τριγωνάκι στην κορυφή, που γίνεται χρυσό (`summit`)·
 *     το χρυσό στο app σημαίνει πάντα personal record.
 *
 * Το προηγούμενο σήμα ήταν μια λεπτή κλιμακωτή γραμμή — διαβαζόταν ως
 * γενικό εικονίδιο γραφήματος. Αυτό είναι μονόγραμμα: δεν μπορεί να ανήκει
 * σε άλλη εφαρμογή.
 *
 * Γεωμετρία: viewBox 512, apex (256,60) → πόδια (60,452)/(452,452), σκέλος 48u
 * με miter join. Τα `rungs=2` είναι η εκδοχή για μικρά μεγέθη (favicon/16px),
 * όπου τρία σκαλιά κλείνουν οπτικά μεταξύ τους.
 */

const LEG = 'M60 452 L256 60 L452 452';
const STROKE = 48;

/**
 * Προϋπολογισμένα από τη γεωμετρία του counter (βλ. scripts/gen-brand-assets.mjs).
 * Τα σκαλιά ΑΓΓΙΖΟΥΝ τα σκέλη — έτσι διαβάζονται ως σκαλοπάτια χτισμένα μέσα
 * στο Α, όχι ως γραμμές που επιπλέουν.
 */
const RUNGS_4 = [
  { x: 194.8, y: 236, w: 122.3 },
  { x: 169.8, y: 286, w: 172.3 },
  { x: 144.8, y: 336, w: 222.3 },
  { x: 119.8, y: 386, w: 272.3 },
];
const RUNGS_2 = [
  { x: 171.8, y: 282, w: 168.3 },
  { x: 132.8, y: 360, w: 246.3 },
];
const APEX_4 = 'M256 113.7 L208.8 208 L303.2 208 Z';
const APEX_2 = 'M256 113.7 L194.8 236 L317.2 236 Z';

export function Logo({
  className,
  summit = false,
  rungs = 4,
}: {
  className?: string;
  /** Χρυσή κορυφή (= PR). Για app icon / splash / branding. */
  summit?: boolean;
  /** 2 για μικρά μεγέθη (≤24px), 4 για κανονικά. */
  rungs?: 2 | 4;
}) {
  const steps = rungs === 2 ? RUNGS_2 : RUNGS_4;
  const apex = rungs === 2 ? APEX_2 : APEX_4;
  const h = rungs === 2 ? 34 : 24;

  return (
    <svg
      viewBox="0 0 512 512"
      className={cn('h-6 w-6', className)}
      role="img"
      aria-label="Anabasis"
    >
      {/* Το miter join στην κορυφή προεξέχει ~54u πάνω από το apex — το 0.9
          κρατά ολόκληρο το σήμα μέσα στο safe area του 512 box. */}
      <g transform="translate(256,256) scale(0.9) translate(-256,-256)">
        <path
          d={LEG}
          fill="none"
          stroke="currentColor"
          strokeWidth={STROKE}
          strokeLinecap="butt"
          strokeLinejoin="miter"
        />
        <path d={apex} fill={summit ? 'hsl(var(--gold))' : 'currentColor'} />
        {steps.map((s) => (
          <rect key={s.y} x={s.x} y={s.y} width={s.w} height={h} rx={2} fill="currentColor" />
        ))}
      </g>
    </svg>
  );
}

/** Λογότυπο + όνομα — για headers. Το wordmark είναι tracked, σαν το brand sheet. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Logo className="h-7 w-7 text-primary" rungs={2} />
      <span className="text-base font-bold uppercase tracking-[0.18em]">Anabasis</span>
    </span>
  );
}
