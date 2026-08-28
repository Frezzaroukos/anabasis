import { useCountUp } from '@/hooks/useCountUp';
import { cn } from '@/lib/utils';

const ACCENT_GRADIENT_ID = 'goal-ring-accent';
const GOLD_GRADIENT_ID = 'goal-ring-gold';

/**
 * Δακτύλιος προόδου στόχου — accent gradient stroke (DESIGN-SPEC-V2 §Charts:
 * «Ring progress για goals/συνέπεια με accent gradient stroke»). Το ποσοστό
 * στο κέντρο «ανεβαίνει» με useCountUp αντί να πηδά απότομα.
 *
 * Τοπικό component (όχι επέκταση του κοινού ProgressRing): ζει εκτός του
 * lane μας, οπότε δεν το αγγίζουμε.
 */
export function GoalRing({
  ratio,
  completed = false,
  size = 64,
  thickness = 6,
  className,
}: {
  /** 0..1 — ήδη κομμένο στο 1 από τον υπολογισμό προόδου. */
  ratio: number;
  completed?: boolean;
  size?: number;
  thickness?: number;
  className?: string;
}) {
  const pct = Math.min(1, Math.max(0, ratio));
  const r = (size - thickness) / 2;
  const circumference = 2 * Math.PI * r;
  const displayPct = useCountUp(Math.round(pct * 100));

  return (
    <div className={cn('relative inline-flex shrink-0 items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <defs>
          <linearGradient id={ACCENT_GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--primary))" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.55} />
          </linearGradient>
          <linearGradient id={GOLD_GRADIENT_ID} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="hsl(var(--gold))" />
            <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={thickness}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${completed ? GOLD_GRADIENT_ID : ACCENT_GRADIENT_ID})`}
          strokeWidth={thickness}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          className={cn(
            'transition-[stroke-dashoffset] duration-500 ease-out motion-reduce:transition-none',
            completed && 'drop-shadow-[0_0_6px_hsl(var(--gold)/0.5)]',
          )}
        />
      </svg>
      <span
        className={cn(
          'absolute font-mono text-sm font-semibold',
          completed ? 'text-gold' : 'text-foreground',
        )}
      >
        {displayPct}%
      </span>
    </div>
  );
}
