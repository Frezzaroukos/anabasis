import { useLiveQuery } from 'dexie-react-hooks';
import { db, LOCAL_USER_ID } from '@/lib/db';
import type { AppSettings } from '@/lib/db/types';

export function useAppSettings(): AppSettings | undefined {
  return useLiveQuery(
    () => db.app_settings.where('user_id').equals(LOCAL_USER_ID).first(),
    [],
  );
}
