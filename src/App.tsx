import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/routes';
import { bootstrapDB } from '@/lib/db';
import { AppBootContext } from '@/app/BootContext';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let teardownAutoSync: (() => void) | undefined;
    bootstrapDB()
      .then(async () => {
        setReady(true);
        // Auth + sync είναι βαρείς (queries/API client/sync engine) και δεν
        // χρειάζονται για το πρώτο paint. Dynamic import ώστε το entry chunk
        // της Αρχικής να μένει ελαφρύ· το boot τα φορτώνει αμέσως μετά.
        const [auth, sync] = await Promise.all([
          import('@/lib/api/auth'),
          import('@/lib/sync'),
        ]);
        // OAuth-redirect fragment (αν υπάρχει, βλ. src/lib/api/auth.ts) ΠΡΙΝ
        // το auto-sync boot-trigger, ώστε το isLoggedIn() check του
        // initAutoSync να δει ήδη τον συνδεδεμένο λογαριασμό.
        await auth.initOAuthFragment();
        // Magic-link (/auth/magic?token=…) — ίδιο σκεπτικό: ΠΡΙΝ το auto-sync.
        await auth.initMagicLink();
        // Cached session without its profile binding (storage was partially
        // cleared) — bind before auto-sync, otherwise push sends local-user rows.
        try {
          await auth.repairMissingProfileBinding();
        } catch (err) {
          console.warn('[auth] profile repair failed', err);
        }
        // Boot-trigger του auto-sync — no-op αν δεν υπάρχει συνδεδεμένος
        // λογαριασμός (βλ. src/lib/sync). ΠΡΕΠΕΙ να τρέξει μετά το bootstrap,
        // αλλιώς τα Dexie hooks θα έπιαναν και τα seed-writes του boot. Το
        // teardown πρέπει να καταγράφεται (StrictMode τρέχει mount/cleanup/
        // mount στο dev) — αλλιώς initAutoSync's guard θα έβλεπε ήδη ενεργό
        // και δεν θα ξανασυνδεόταν στο δεύτερο πραγματικό mount.
        teardownAutoSync = sync.initAutoSync();
      })
      .catch((err: unknown) => {
        console.error('[bootstrap]', err);
        setError(err instanceof Error ? err.message : 'Unknown DB error');
      });
    return () => teardownAutoSync?.();
  }, []);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center">
        <div>
          <p className="text-sm font-semibold text-destructive">DB error</p>
          <p className="mt-2 text-xs text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <AppBootContext.Provider value={ready}>
      <RouterProvider router={router} />
    </AppBootContext.Provider>
  );
}
