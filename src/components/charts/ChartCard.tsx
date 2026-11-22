import type { ReactNode } from 'react';
import { Suspense } from 'react';
import { Card, SectionTitle } from '@/components/ui/Section';
import { ChartSkeleton } from './ChartSkeleton';

/**
 * Ενιαία κάρτα για κάθε chart της Προόδου: τίτλος + σύνολο δεξιά + υπόδειγμα
 * (hint) + σώμα με σταθερό ύψος. Το σώμα φορτώνεται lazily (recharts chunk)
 * πίσω από Suspense — ένα σημείο για skeleton αντί για επανάληψη σε κάθε chart.
 */
export function ChartCard({
  title,
  total,
  hint,
  height = 'h-44',
  footer,
  children,
}: {
  title: string;
  /** σύντομο σύνολο (π.χ. «12 sessions») δεξιά στον τίτλο */
  total?: string;
  hint?: string;
  height?: string;
  /** προαιρετικό legend κάτω από το chart */
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="min-w-0">
      <SectionTitle
        action={
          total ? (
            <span className="font-mono text-xs tabular-nums text-muted-foreground">{total}</span>
          ) : undefined
        }
      >
        {title}
      </SectionTitle>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className={`mt-3 w-full ${height}`}>
        <Suspense fallback={<ChartSkeleton />}>{children}</Suspense>
      </div>
      {footer}
    </Card>
  );
}
