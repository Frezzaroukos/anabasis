import { useEffect, useState } from 'react';

/**
 * Παρακολουθεί την κατάσταση δικτύου του browser (`navigator.onLine`).
 * Offline-first app — αυτό ΔΕΝ μπλοκάρει τίποτα· χρησιμεύει μόνο για ένα
 * διακριτικό μήνυμα ότι ο συγχρονισμός θα περιμένει το δίκτυο.
 *
 * Αρχικοποιείται optimistic (`true`) στο SSR/χωρίς navigator ώστε να μη
 * φανεί ένα λάθος «offline» flash πριν προλάβει να μετρηθεί.
 */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine,
  );

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
