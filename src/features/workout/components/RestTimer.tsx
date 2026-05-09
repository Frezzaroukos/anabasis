import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { useRestTimer } from '@/hooks/useRestTimer';
import { useAppSettings } from '@/hooks/useAppSettings';
import { cn } from '@/lib/utils';

function beep() {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      osc.stop();
      void ctx.close();
    }, 220);
  } catch {
    /* audio unavailable */
  }
}

export function RestTimer() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const defaultSeconds = settings?.default_rest_timer_seconds ?? 180;

  const onComplete = useCallback(() => {
    beep();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 80, 200]);
    }
  }, []);

  const { remaining, running, start, stop } = useRestTimer({ defaultSeconds, onComplete });

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const display = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;

  return (
    <button
      type="button"
      onClick={() => (running ? stop() : start())}
      className={cn(
        'flex w-full items-center justify-between gap-3 rounded-lg border border-border px-4 py-3',
        running ? 'bg-primary text-primary-foreground' : 'bg-card hover:bg-accent',
      )}
      aria-label={running ? t('workout.rest.stop') : t('workout.rest.start')}
    >
      <div className="flex items-center gap-2">
        <Timer className="h-4 w-4" />
        <span className="text-sm font-medium">
          {running ? t('workout.rest.restingShort') : t('workout.rest.start')}
        </span>
      </div>
      <span className="font-mono text-2xl font-semibold tabular-nums">
        {running ? display : `${Math.floor(defaultSeconds / 60)}:${String(defaultSeconds % 60).padStart(2, '0')}`}
      </span>
    </button>
  );
}
