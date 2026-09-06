/**
 * Local-only cache των /api/social reads (friends/requests/leaderboard) ώστε το
 * social surface να δείχνει **last-known** δεδομένα offline αντί για κενό. ΠΟΤΕ
 * δεν συγχρονίζεται (εκτός USER_DATA_TABLES/ALLOWED_TABLES) — καθαρός τοπικός
 * καθρέφτης. Ξεχωριστό αρχείο (oxc threshold).
 */
import { db } from './schema';
import type { FriendRow, LeaderboardRow } from '../api/types';

/** Αντικαθιστά όλο το friends cache με την τελευταία απάντηση του server. */
export async function writeFriendsCache(friends: FriendRow[], requests: FriendRow[]): Promise<void> {
  const all = [...friends, ...requests];
  await db.transaction('rw', db.friends_cache, async () => {
    await db.friends_cache.clear();
    if (all.length > 0) await db.friends_cache.bulkPut(all);
  });
}

/** Διαβάζει το cached social graph, χωρισμένο σε φίλους / εκκρεμή αιτήματα. */
export async function readFriendsCache(): Promise<{ friends: FriendRow[]; requests: FriendRow[] }> {
  const rows = await db.friends_cache.toArray();
  return {
    friends: rows.filter((r) => r.direction === 'friend'),
    requests: rows.filter((r) => r.direction === 'in' || r.direction === 'out'),
  };
}

/** Upsert του leaderboard ενός scope. */
export async function writeLeaderboardCache(scope: string, rows: LeaderboardRow[]): Promise<void> {
  await db.leaderboard_cache.put({ scope, rows, updated_at: new Date().toISOString() });
}

/** Cached leaderboard ενός scope (κενό αν δεν υπάρχει). */
export async function readLeaderboardCache(scope: string): Promise<LeaderboardRow[]> {
  const row = await db.leaderboard_cache.get(scope);
  return row?.rows ?? [];
}
