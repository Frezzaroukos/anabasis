import { Suspense } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { BottomTabNav } from '@/components/layout/BottomTabNav';
import { NavBar } from '@/components/layout/NavBar';
import { SideNav } from '@/components/layout/SideNav';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { OnboardingOverlay } from '@/features/onboarding/OnboardingOverlay';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';
import { ActiveWorkoutView } from '@/features/workout/components/ActiveWorkoutView';

/** Διακριτικό placeholder όσο φορτώνει ένα lazy route chunk. */
function PageFallback() {
  return (
    <div className="flex animate-in fade-in items-center justify-center py-20 duration-300">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export function AppShell() {
  const { t } = useTranslation();
  const active = useActiveWorkout();
  const hasActive = active != null;
  // key ανά διαδρομή → το boundary ξεκαθαρίζει το σφάλμα όταν αλλάζεις σελίδα,
  // αλλιώς μια σπασμένη σελίδα θα έμενε σπασμένη και μετά την πλοήγηση.
  const { pathname } = useLocation();

  return (
    /*
     * Κινητό: μία στήλη με tabs στον πάτο.
     * Tablet/desktop (≥md): πλαϊνή στήλη πλοήγησης + πιο φαρδύ περιεχόμενο.
     * Χωρίς αυτό, σε οθόνη 1440px το app ήταν μια λωρίδα 448px σε μαύρο κενό.
     */
    <div className="flex min-h-full bg-background">
      <SideNav />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Κρατά και το safe-area padding του notch — γι' αυτό δεν είναι πια
            στο <main>: αλλιώς θα μετριόταν δύο φορές. */}
        <NavBar />
        {/*
          Το bottom nav έχει δικό του safe-bottom, οπότε σε συσκευή με home
          indicator είναι ψηλότερο από 6rem — σκέτο pb-24 έκρυβε την τελευταία
          γραμμή κάθε σελίδας.
        */}
        <main className="mx-auto w-full max-w-md flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-6 md:max-w-4xl md:px-8 md:pb-10 lg:max-w-5xl">
          <ErrorBoundary
            key={pathname}
            message={t('common.pageError')}
            retryLabel={t('common.retry')}
          >
            <Suspense fallback={<PageFallback />}>
              {/*
                Θεατρική είσοδος σελίδας (M3): το περιεχόμενο ανεβαίνει +
                μεγαλώνει ελαφρά από 0.98 σε κάθε πλοήγηση (key={pathname}) —
                premium, χωρίς layout shift, καταρρέει σε fade με reduced-motion.
              */}
              <div key={pathname} className="animate-page-enter">
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
      {!hasActive && <BottomTabNav />}
      {hasActive && <ActiveWorkoutView workout={active} />}
      {/* Ελέγχει μόνο του το localStorage· null αν έχει γίνει ήδη onboard. */}
      <OnboardingOverlay />
    </div>
  );
}
