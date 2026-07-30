import { useLiveQuery } from 'dexie-react-hooks';
import { queries } from '@/lib/db';
import type { Activity } from '@/lib/db/types';

/** Δραστηριότητες (ενεργές, ή +αρχειοθετημένες), ταξινομημένες κατά display_order. */
export function useActivities(includeArchived = false): Activity[] {
  return (
    useLiveQuery(() => queries.listActivities(includeArchived), [includeArchived]) ?? []
  );
}

/**
 * Μία δραστηριότητα με βάση το key της (π.χ. workout.activity_kind).
 * Ψάχνει και στις αρχειοθετημένες — ένα παλιό workout μπορεί να δείχνει
 * σε δραστηριότητα που έχει πλέον αρχειοθετηθεί, και πρέπει να συνεχίσει
 * να ξέρει αν είναι set-logged ή όχι.
 */
export function useActivity(key: string | null | undefined): Activity | undefined {
  const all = useActivities(true);
  return key ? all.find((a) => a.key === key) : undefined;
}
