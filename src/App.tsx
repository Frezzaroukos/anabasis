import { useEffect, useState } from 'react';
import { RouterProvider } from 'react-router-dom';
import { router } from '@/app/routes';
import { bootstrapDB } from '@/lib/db';

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bootstrapDB()
      .then(() => setReady(true))
      .catch((err: unknown) => {
        console.error('[bootstrap]', err);
        setError(err instanceof Error ? err.message : 'Unknown DB error');
      });
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
