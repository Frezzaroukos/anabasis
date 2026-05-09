import { Outlet } from 'react-router-dom';
import { BottomTabNav } from '@/components/layout/BottomTabNav';

export function AppShell() {
  return (
    <div className="flex min-h-full flex-col bg-background">
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-24 pt-6 safe-top">
        <Outlet />
      </main>
      <BottomTabNav />
    </div>
  );
}
