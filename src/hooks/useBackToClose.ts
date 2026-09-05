import { useEffect, useRef } from 'react';

/**
 * Android/PWA hardware-back (ή gesture) κλείνει το ανοιχτό overlay (sheet/dialog)
 * αντί να βγάζει από το app και να χάνει τη φόρμα. Όταν ανοίγει το overlay,
 * σπρώχνουμε ένα history entry· το back το ξεσπρώχνει → popstate → onClose.
 * Αν κλείσει από το UI (backdrop/κουμπί), αφαιρούμε μόνοι μας το entry.
 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const cb = useRef(onClose);
  cb.current = onClose;

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    let poppedByBack = false;
    window.history.pushState({ overlay: true }, '');
    const onPop = () => {
      poppedByBack = true;
      cb.current();
    };
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('popstate', onPop);
      // Έκλεισε από το UI (όχι με back) → αφαίρεσε το δικό μας history entry.
      if (!poppedByBack) window.history.back();
    };
  }, [open]);
}
