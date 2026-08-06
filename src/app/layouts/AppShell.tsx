import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { BottomTabNav } from '@/components/layout/BottomTabNav';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { ActiveWorkoutView } from '@/features/workout/components/ActiveWorkoutView';

/** Διακριτικό placeholder όσο φορτώνει ένα lazy route chunk. */
function PageFallback() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export function AppShell() {
  const active = useActiveWorkout();
  const hasActive = active != null;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6 safe-top">
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>
      {!hasActive && <BottomTabNav />}
      {hasActive && <ActiveWorkoutView workout={active} />}
    </div>
  );
}
