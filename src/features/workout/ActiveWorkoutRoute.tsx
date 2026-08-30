import { Navigate } from 'react-router-dom';
import { useActiveWorkout } from '@/hooks/useActiveWorkout';

/**
 * Το route της ενεργής προπόνησης (`/workout/active`). Ο ίδιος ο logger
 * εμφανίζεται από το AppShell ως takeover όσο υπάρχει ενεργή session — εδώ
 * απλώς κρατάμε έναν έγκυρο προορισμό ώστε η πλοήγηση από το Calendar/Programs
 * να μη χτυπά not-found, και όταν ΔΕΝ υπάρχει ενεργή προπόνηση (π.χ. μόλις
 * τελείωσε) γυρνάμε στο ημερολόγιο — το κέντρο της εφαρμογής.
 */
export function ActiveWorkoutRoute() {
  const active = useActiveWorkout();
  if (!active) return <Navigate to="/calendar" replace />;
  return null;
}
