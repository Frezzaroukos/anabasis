import { describe, expect, it } from 'vitest';
import { filterUsers, formatBytes, formatUptime } from './utils';
import type { AdminUser } from '@/lib/api/types';

describe('formatBytes', () => {
  it('δείχνει bytes κάτω από 1024', () => {
    expect(formatBytes(512)).toBe('512 B');
  });

  it('γυρίζει σε KB/MB/GB όπως ταιριάζει', () => {
    expect(formatBytes(2048)).toBe('2.0 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
    expect(formatBytes(3 * 1024 * 1024 * 1024)).toBe('3.0 GB');
  });
});

describe('formatUptime', () => {
  it('δείχνει μέρες+ώρες όταν υπάρχουν μέρες', () => {
    expect(formatUptime(2 * 86400 + 4 * 3600)).toBe('2d 4h');
  });

  it('δείχνει ώρες+λεπτά κάτω από μέρα', () => {
    expect(formatUptime(3 * 3600 + 15 * 60)).toBe('3h 15m');
  });

  it('δείχνει μόνο λεπτά κάτω από ώρα', () => {
    expect(formatUptime(42 * 60)).toBe('42m');
  });

  it('δείχνει δευτερόλεπτα κάτω από λεπτό', () => {
    expect(formatUptime(30)).toBe('30s');
  });
});

const user = (over: Partial<AdminUser>): AdminUser => ({
  id: over.email ?? 'id',
  email: 'a@example.com',
  role: 'user',
  disabled: false,
  created_at: '2026-01-01T00:00:00Z',
  last_sync_at: null,
  row_count: 0,
  sessions: 0,
  ...over,
});

const USERS: AdminUser[] = [
  user({ email: 'aggelos@gmail.com', role: 'admin' }),
  user({ email: 'friend@proton.me' }),
  user({ email: 'banned@gmail.com', disabled: true }),
];

describe('filterUsers', () => {
  it('χωρίς query/φίλτρο επιστρέφει τα πάντα', () => {
    expect(filterUsers(USERS, '', 'all')).toHaveLength(3);
  });

  it('ταιριάζει substring στο email χωρίς πεζά/κεφαλαία', () => {
    expect(filterUsers(USERS, 'GMAIL', 'all').map((u) => u.email)).toEqual([
      'aggelos@gmail.com',
      'banned@gmail.com',
    ]);
  });

  it('αγνοεί κενά γύρω από το query', () => {
    expect(filterUsers(USERS, '  proton  ', 'all')).toHaveLength(1);
  });

  it('φιλτράρει ανά κατάσταση', () => {
    expect(filterUsers(USERS, '', 'active')).toHaveLength(2);
    expect(filterUsers(USERS, '', 'disabled').map((u) => u.email)).toEqual(['banned@gmail.com']);
    expect(filterUsers(USERS, '', 'admins').map((u) => u.email)).toEqual(['aggelos@gmail.com']);
  });

  it('συνδυάζει query ΚΑΙ φίλτρο', () => {
    expect(filterUsers(USERS, 'gmail', 'disabled').map((u) => u.email)).toEqual([
      'banned@gmail.com',
    ]);
  });
});
