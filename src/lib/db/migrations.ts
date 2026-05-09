/**
 * Schema migration registry.
 * Each entry is the upgrade function for transitioning *into* version N.
 * Dexie's `.upgrade()` callback runs only when the user's DB is below N.
 *
 * v1 = initial schema, no upgrade needed.
 */

import type { StrengthAtlasDB } from './schema';

export type Migration = (db: StrengthAtlasDB) => Promise<void> | void;

export const migrations: Record<number, Migration> = {
  1: () => {
    /* initial — no transform */
  },
};
