import { formatHMS, useSessionTimer } from '@/hooks/useSessionTimer';

/**
 * Ο χρόνος της προπόνησης — ΠΟΤΕ headline. Μικρό, μουντό, βοηθητικό detail
 * δίπλα στον τίτλο, όχι κυρίαρχο ρολόι-χρονόμετρο (feedback: «δεν είναι όπως
 * θέλω» για το takeover-stopwatch). Το rest timer παραμένει το κυρίαρχο.
 */
export function SessionTimer({ startedAt }: { startedAt: string }) {
  const elapsed = useSessionTimer(startedAt);
  return (
    <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
      {formatHMS(elapsed)}
    </span>
  );
}
