import { formatHMS, useSessionTimer } from '@/hooks/useSessionTimer';

export function SessionTimer({ startedAt }: { startedAt: string }) {
  const elapsed = useSessionTimer(startedAt);
  return (
    <span className="font-mono text-base tabular-nums text-foreground">
      {formatHMS(elapsed)}
    </span>
  );
}
