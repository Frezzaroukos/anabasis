import { useLiveQuery } from 'dexie-react-hooks';
import { db, } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import type { AppSettings } from '@/lib/db/types';

export function useAppSettings(): AppSettings | undefined {
  return useLiveQuery(
    () => db.app_settings.where('user_id').equals(getCurrentUserId()).first(),
    [],
  );
}
