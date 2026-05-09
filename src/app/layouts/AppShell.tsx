import { Outlet } from 'react-router-dom';
import { BottomTabNav } from '@/components/layout/BottomTabNav';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { ActiveWorkoutView } from '@/features/workout/components/ActiveWorkoutView';

export function AppShell() {
  const active = useActiveWorkout();
  const hasActive = active != null;

  return (
    <div className="flex min-h-full flex-col bg-background">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6 safe-top">
        <Outlet />
      </main>
      {!hasActive && <BottomTabNav />}
      {hasActive && <ActiveWorkoutView workout={active} />}
    </div>
  );
}
