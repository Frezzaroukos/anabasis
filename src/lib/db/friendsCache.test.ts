import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { db } from './index';
import { bootstrapDB } from './bootstrap';
import {
  writeFriendsCache,
  readFriendsCache,
  writeLeaderboardCache,
  readLeaderboardCache,
} from './friendsCache';
import type { FriendRow, LeaderboardRow } from '../api/types';

beforeAll(async () => {
  await bootstrapDB();
});
beforeEach(async () => {
  await db.friends_cache.clear();
  await db.leaderboard_cache.clear();
});

function friend(id: string, direction: FriendRow['direction']): FriendRow {
  return {
    account_id: id,
    username: id,
    display_name: null,
    status: direction === 'friend' ? 'accepted' : 'pending',
    direction,
    level: 3,
    xp: 900,
    tier: 'ridge',
    altitude_m: 1200,
    streak_days: 2,
    badges: '[]',
  };
}

describe('friendsCache (offline reads)', () => {
  it('γράφει & διαβάζει φίλους/αιτήματα χωρισμένα ανά direction', async () => {
    await writeFriendsCache(
      [friend('a', 'friend'), friend('b', 'friend')],
      [friend('c', 'in'), friend('d', 'out')],
    );
    const { friends, requests } = await readFriendsCache();
    expect(friends.map((f) => f.account_id).sort()).toEqual(['a', 'b']);
    expect(requests.map((r) => r.account_id).sort()).toEqual(['c', 'd']);
  });

  it('το write αντικαθιστά (δεν συσσωρεύει) το προηγούμενο cache', async () => {
    await writeFriendsCache([friend('a', 'friend')], []);
    await writeFriendsCache([friend('x', 'friend')], []);
    const { friends } = await readFriendsCache();
    expect(friends.map((f) => f.account_id)).toEqual(['x']);
  });

  it('leaderboard cache ανά scope', async () => {
    const rows: LeaderboardRow[] = [
      { username: 'me', display_name: null, level: 5, xp: 2500, tier: 'alpine', altitude_m: 2918, streak_days: 4, badges: '[]', is_self: true },
    ];
    await writeLeaderboardCache('friends', rows);
    expect((await readLeaderboardCache('friends'))[0]?.username).toBe('me');
    expect(await readLeaderboardCache('global')).toEqual([]); // άλλο scope = κενό
  });
});
