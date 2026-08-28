import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/routes';
import { bootstrapDB } from '@/lib/db';
import { initAutoSync } from '@/lib/sync';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let teardownAutoSync: (() => void) | undefined;
    bootstrapDB()
      .then(() => {
        setReady(true);
        // Boot-trigger του auto-sync — no-op αν δεν υπάρχει συνδεδεμένος
        // λογαριασμός (βλ. src/lib/sync). ΠΡΕΠΕΙ να τρέξει μετά το bootstrap,
        // αλλιώς τα Dexie hooks θα έπιαναν και τα seed-writes του boot. Το
        // teardown πρέπει να καταγράφεται (StrictMode τρέχει mount/cleanup/
        // mount στο dev) — αλλιώς initAutoSync's guard θα έβλεπε ήδη ενεργό
        // και δεν θα ξανασυνδεόταν στο δεύτερο πραγματικό mount.
        teardownAutoSync = initAutoSync();
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

  if (!ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-pulse rounded-full bg-muted" />
      </div>
    );
  }

  return <RouterProvider router={router} />;
}
