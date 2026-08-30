import { cn } from '@/lib/utils';

/**
 * Δακτύλιος προόδου — «πόσο μακριά είμαι από τον στόχο» με μία ματιά.
 *
 * Ένα νούμερο («4.250 kg») δεν λέει αν πήγε καλά η εβδομάδα· ένας δακτύλιος
 * στο 70% το λέει πριν προλάβεις να διαβάσεις. Γι' αυτό ο αριθμός μένει στο
 * κέντρο (η ακρίβεια) και ο δακτύλιος δίνει τη σχέση (το νόημα).
 *
 * SVG με stroke-dasharray — καμία εξάρτηση, δουλεύει offline, κλιμακώνεται.
 */
export function ProgressRing({
  value,
  max,
  label,
  sub,
  size = 128,
  thickness = 10,
  className,
  tone = 'primary',
}: {
  value: number;
  max: number;
  /** Μεγάλο κείμενο στο κέντρο (π.χ. «18.6s»). */
  label: React.ReactNode;
  /** Μικρό από κάτω (π.χ. «/ 30s»). */
  sub?: React.ReactNode;
  size?: number;
  thickness?: number;
  className?: string;
  tone?: 'primary' | 'gold';
}) {
  const pct = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        {/* Το track είναι hairline (--border), όχι γεμάτο --muted — ο δακτύλιος
            προόδου μένει το μόνο έντονο στοιχείο. */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={tone === 'gold' ? 'hsl(var(--gold))' : 'hsl(var(--primary))'}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className="transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none"
          style={{
            filter: `drop-shadow(0 0 6px hsl(var(--${tone === 'gold' ? 'gold' : 'primary'}) / 0.4))`,
          }}
        />
      </svg>
      <span className="absolute flex flex-col items-center leading-none">
        <span className="font-mono text-2xl font-semibold">{label}</span>
        {sub != null && (
          <span className="mt-1 font-mono text-xs text-muted-foreground">{sub}</span>
        )}
      </span>
    </div>
  );
}
