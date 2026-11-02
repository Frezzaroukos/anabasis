import { cn } from '@/lib/utils';
import { Spinner } from './spinner';

export function LoadingState({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      className={cn('flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground', className)}
    >
      <Spinner className="h-4 w-4" />
      <span>{label}</span>
    </div>
  );
}
