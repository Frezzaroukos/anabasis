import { cn } from '@/lib/utils';

/**
 * Placeholder όσο κατεβαίνει το recharts chunk (lazy). Γεμίζει ΑΚΡΙΒΩΣ το κουτί
 * του γραφήματος (ο caller δίνει το ύψος μέσω του γονέα), ώστε το layout να μη
 * «πηδάει» όταν μπει το πραγματικό chart. Διακριτικό pulse — όχι θεατρικό.
 */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('h-full w-full animate-pulse rounded-md bg-muted/30', className)}
    />
  );
}
