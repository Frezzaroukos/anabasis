import { useEffect, useRef } from 'react';

/**
 * Κρατά ενεργή την οθόνη όσο `active` (π.χ. υπάρχει τρέχον workout) —
 * στο γυμναστήριο η οθόνη κλείνει ανάμεσα σε σετ και χάνεται το context.
 * Το Wake Lock API δεν υπάρχει σε όλα τα browsers/contexts (π.χ. iOS Safari
 * παλιότερες εκδόσεις, http χωρίς TLS) — no-op χωρίς console spam όταν λείπει.
 * Ξαναποκτά το lock όταν το tab ξαναγίνεται ορατό (ο browser το αποδεσμεύει
 * αυτόματα όταν κρύβεται).
 */
export function useWakeLock(active: boolean): void {
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!('wakeLock' in navigator)) return;

    let cancelled = false;

    const acquire = async () => {
      try {
        const sentinel = await navigator.wakeLock.request('screen');
        if (cancelled) {
          void sentinel.release();
          return;
        }
        sentinelRef.current = sentinel;
      } catch {
        // Άρνηση permission ή context που δεν το επιτρέπει — αγνόησε ήσυχα.
      }
    };

    void acquire();

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sentinelRef.current == null) {
        void acquire();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      const s = sentinelRef.current;
      sentinelRef.current = null;
      if (s) void s.release().catch(() => {});
    };
  }, [active]);
}
