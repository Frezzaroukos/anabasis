import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * EmptyState — κοινό, συνεπές empty state για λίστες/σελίδες.
 *
 * Ενοποιεί τη γλώσσα που έτρεχε αντιγραμμένη σε πολλά features (κεντραρισμένη
 * κάρτα, εικονίδιο muted, τίτλος + προαιρετικό hint + προαιρετικό action).
 * Δύο όψεις: `card` (γεμάτη — default, όπως Programs/Goals/History) και `dashed`
 * (διακεκομμένο περίγραμμα — onboarding/placeholder tone).
 */
interface EmptyStateProps {
  /** Lucide icon component (π.χ. ListChecks). Παραλείπεται → χωρίς εικονίδιο. */
  icon?: LucideIcon;
  /** Override για μέγεθος/χρώμα εικονιδίου (default: h-8 w-8 muted). */
  iconClassName?: string;
  title: string;
  /** Δευτερεύουσα γραμμή κάτω από τον τίτλο. */
  hint?: string;
  /** CTA (π.χ. κουμπί «Νέο»). */
  action?: ReactNode;
  variant?: 'card' | 'dashed';
  className?: string;
}

export function EmptyState({
  icon: Icon,
  iconClassName,
  title,
  hint,
  action,
  variant = 'card',
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center gap-3 px-6 py-10 text-center',
        variant === 'dashed'
          ? 'rounded-lg border border-dashed border-border bg-card'
          : 'rounded-xl bg-card',
        className,
      )}
    >
      {Icon && (
        <Icon className={cn('h-8 w-8 text-muted-foreground/60', iconClassName)} aria-hidden />
      )}
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint && (
          <p className="mx-auto max-w-xs text-xs leading-relaxed text-muted-foreground">{hint}</p>
        )}
      </div>
      {action}
    </div>
  );
}
