import { useTranslation } from 'react-i18next';
import { Play, Pause } from 'lucide-react';
import { formatHMS } from '@/hooks/useSessionTimer';
import { useManualStopwatch } from '@/hooks/useManualStopwatch';

/**
 * Χειροκίνητο χρονόμετρο προπόνησης — ο χρήστης το ΞΕΚΙΝΑ/ΣΤΑΜΑΤΑ με τη θέλησή
 * του (owner: «το timer να το ξεκινάς με θέλησή σου και να το σταματάς»). Όχι
 * κυρίαρχο ρολόι-takeover· ένα μικρό, διακριτικό control δίπλα στον τίτλο. Ο
 * χρόνος περνάει ως τίμια διάρκεια στο endWorkout (βλ. useManualStopwatch).
 */
export function SessionTimer({ workoutId }: { workoutId: string }) {
  const { t } = useTranslation();
  const { seconds, running, toggle } = useManualStopwatch(workoutId);

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={running ? t('workout.timer.pause') : t('workout.timer.start')}
      className={`flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[11px] tabular-nums transition-colors ${
        running
          ? 'bg-primary/15 text-foreground'
          : 'text-muted-foreground/70 hover:bg-elevated hover:text-foreground'
      }`}
    >
      {running ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
      {formatHMS(seconds)}
    </button>
  );
}
