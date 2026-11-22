import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Minus, Plus, Timer, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { updateSettings } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import {
  adjustRest,
  formatRest,
  isRestTimerEnabled,
  setRestFinishHandler,
  stopRest,
  useRestTimer,
} from '../restTimer';

/** Σύντομο beep (WebAudio) — χωρίς asset. Σιωπηλό αν το API λείπει/μπλοκάρεται. */
function beep(): void {
  try {
    const Ctx =
      globalThis.AudioContext ??
      (globalThis as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.36);
    osc.onended = () => void ctx.close();
  } catch {
    /* autoplay policy / unsupported */
  }
}

/**
 * Μπάρα ανάπαυσης κάτω από τη λίστα ασκήσεων: countdown + −15/+15 + skip.
 * Ξεκινά αυτόματα μετά από κάθε σετ (ρύθμιση auto_start_rest_timer) και στο
 * τέλος δονεί/βαράει (ρύθμιση notify_rest_timer) όπου υποστηρίζεται.
 */
export function RestTimerBar() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const { endsAt, finished, remaining, totalSeconds } = useRestTimer();
  const enabled = isRestTimerEnabled(settings);
  const notify = enabled && (settings?.notify_rest_timer ?? true);
  const auto = settings?.auto_start_rest_timer ?? true;

  useEffect(() => {
    setRestFinishHandler(() => {
      if (!notify) return;
      try {
        globalThis.navigator?.vibrate?.([220, 100, 220]);
      } catch {
        /* unsupported */
      }
      beep();
    });
    return () => setRestFinishHandler(null);
  }, [notify]);

  // Αν ο διακόπτης κλείσει (ή φορτώσει κλειστός) ενώ υπάρχει ενεργό/παλιό
  // countdown από localStorage, σταμάτα το — καμία σιωπηλή ουρά, κανένας ήχος.
  useEffect(() => {
    if (settings && !enabled && (endsAt != null || finished)) stopRest();
  }, [settings, enabled, endsAt, finished]);

  // Η μπάρα «έτοιμος» σβήνει μόνη της μετά από λίγο — να μη μένει σαν σκουπίδι.
  useEffect(() => {
    if (!finished) return;
    const id = globalThis.setTimeout(stopRest, 8000);
    return () => globalThis.clearTimeout(id);
  }, [finished]);

  const running = endsAt != null;
  // Κλειστό = ούτε μπάρα ούτε ήχος· και ό,τι έτρεχε σταματά αν το κλείσεις.
  if (!enabled || (!running && !finished)) return null;
  const progress = running && totalSeconds > 0 ? Math.min(1, remaining / totalSeconds) : 0;

  return (
    <div
      role="timer"
      aria-live="off"
      className={cn(
        'border-t border-border/60 bg-card px-3 py-2',
        finished && 'bg-primary/10',
      )}
    >
      <div className="mx-auto flex w-full max-w-md items-center gap-2 md:max-w-3xl lg:max-w-4xl">
        <Timer className={cn('h-4 w-4 shrink-0', finished ? 'text-primary' : 'text-muted-foreground')} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">
              {finished ? t('workout.rest.over') : t('workout.rest.restingShort')}
            </span>
            {running && (
              <span className="font-mono text-lg font-semibold tabular-nums" data-testid="rest-remaining">
                {formatRest(remaining)}
              </span>
            )}
          </div>
          {running && (
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-elevated" aria-hidden>
              <div className="h-full rounded-full bg-primary transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
            </div>
          )}
        </div>
        {running && (
          <>
            <button
              type="button"
              onClick={() => adjustRest(-15)}
              aria-label={t('workout.rest.minus15')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95"
            >
              <Minus className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => adjustRest(15)}
              aria-label={t('workout.rest.plus15')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95"
            >
              <Plus className="h-4 w-4" />
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void updateSettings({ auto_start_rest_timer: !auto })}
          aria-pressed={auto}
          className={cn(
            'min-h-11 shrink-0 rounded-md px-2 text-xs font-medium',
            auto ? 'text-primary' : 'text-muted-foreground',
          )}
        >
          {auto ? t('workout.rest.autoOn') : t('workout.rest.autoOff')}
        </button>
        <button
          type="button"
          onClick={stopRest}
          aria-label={running ? t('workout.rest.stop') : t('workout.rest.dismiss')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground active:scale-95"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
