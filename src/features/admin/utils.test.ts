import { describe, expect, it } from 'vitest';
import { formatBytes, formatUptime } from './utils';

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
