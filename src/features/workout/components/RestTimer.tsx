import { useCallback, useEffect, useId, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Timer } from 'lucide-react';
import { useRestTimer } from '@/hooks/useRestTimer';
import { useAppSettings } from '@/hooks/useAppSettings';

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

interface RestTimerProps {
  /** Αυξάνει κάθε φορά που καταγράφεται νέο σετ — trigger για auto-start. */
  restartSignal?: number;
}

/** Δακτύλιος: γεμάτος = έτοιμος να ξεκινήσει, αδειάζει καθώς περνάει ο χρόνος. */
const RING_RADIUS = 42;
const RING_STROKE = 6;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function RestTimer({ restartSignal }: RestTimerProps) {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const defaultSeconds = settings?.default_rest_timer_seconds ?? 180;
  // Οι εγκαταστάσεις πριν το schema v4 δεν έχουν το πεδίο — σιωπηλός timer
  // θα ήταν χειρότερη έκπληξη από έναν ήχο, οπότε το default είναι «ναι».
  const notifyEnabled = settings?.notify_rest_timer ?? true;
  // Default ON: στο γυμναστήριο θέλεις να μετράει το ρεστ αυτόματα, όχι να
  // θυμάσαι να πατήσεις start μετά από κάθε σετ.
  const autoStartEnabled = settings?.auto_start_rest_timer ?? true;
  // Μοναδικό id ώστε το gradient να μη συγκρούεται αν ποτέ υπάρξουν 2 δακτύλιοι.
  const gradientId = useId();

  const onComplete = useCallback(() => {
    if (!notifyEnabled) return;
    beep();
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 80, 200]);
    }
  }, [notifyEnabled]);

  const { remaining, running, start, stop } = useRestTimer({ defaultSeconds, onComplete });

  // Πρώτο render δεν πρέπει να ξεκινάει τίποτα — μόνο πραγματικές αλλαγές
  // του restartSignal (δηλαδή ένα καινούριο σετ καταγράφηκε).
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    if (restartSignal == null || !autoStartEnabled) return;
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal]);

  const mm = Math.floor(remaining / 60);
  const ss = remaining % 60;
  const display = `${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  const defaultDisplay = `${Math.floor(defaultSeconds / 60)}:${String(defaultSeconds % 60).padStart(2, '0')}`;

  const progress = running ? Math.min(1, Math.max(0, remaining / Math.max(1, defaultSeconds))) : 1;
  const dashOffset = RING_CIRCUMFERENCE * (1 - progress);

  return (
    <button
      type="button"
      onClick={() => (running ? stop() : start())}
      className="mx-auto flex flex-col items-center gap-1 rounded-full transition-transform active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
      aria-label={running ? t('workout.rest.stop') : t('workout.rest.start')}
    >
      <span className="relative flex h-24 w-24 items-center justify-center">
        <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(var(--primary))" />
              <stop offset="100%" stopColor="hsl(var(--primary) / 0.55)" />
            </linearGradient>
          </defs>
          <circle cx="48" cy="48" r={RING_RADIUS} strokeWidth={RING_STROKE} fill="none" stroke="hsl(var(--border))" />
          <circle
            cx="48"
            cy="48"
            r={RING_RADIUS}
            strokeWidth={RING_STROKE}
            strokeLinecap="round"
            fill="none"
            stroke={`url(#${gradientId})`}
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={dashOffset}
            className="transition-[stroke-dashoffset] duration-300 ease-linear"
            style={running ? { filter: 'drop-shadow(0 0 6px hsl(var(--primary) / 0.5))' } : undefined}
          />
        </svg>
        <span className="absolute flex flex-col items-center">
          <span className="font-display text-2xl font-semibold tabular-nums text-foreground">
            {running ? display : defaultDisplay}
          </span>
          <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Timer className="h-3 w-3" aria-hidden />
            {running ? t('workout.rest.restingShort') : t('workout.rest.start')}
          </span>
        </span>
      </span>
    </button>
  );
}
