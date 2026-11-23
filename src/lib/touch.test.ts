import { afterEach, describe, expect, it, vi } from 'vitest';
import { hapticTick, hiddenBelowViewport, isCoarsePointer } from './touch';

afterEach(() => vi.unstubAllGlobals());

describe('hiddenBelowViewport', () => {
  it('0 when the element bottom (plus margin) is inside the visible viewport', () => {
    expect(hiddenBelowViewport(400, { height: 500, offsetTop: 0 })).toBe(0);
    expect(hiddenBelowViewport(492, { height: 500, offsetTop: 0 })).toBe(0);
  });

  it('counts the pixels hidden behind the soft keyboard', () => {
    // 844px phone, keyboard 354px → visible 490px; button bottom at 700.
    expect(hiddenBelowViewport(700, { height: 490, offsetTop: 0 })).toBe(218);
  });

  it('accounts for a panned visual viewport (iOS scrolls it, not the layout)', () => {
    expect(hiddenBelowViewport(700, { height: 490, offsetTop: 200 })).toBe(18);
    expect(hiddenBelowViewport(700, { height: 490, offsetTop: 220 })).toBe(0);
  });
});

describe('isCoarsePointer', () => {
  it('false without matchMedia (jsdom/SSR) and follows the media query otherwise', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(isCoarsePointer()).toBe(false);
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(pointer: coarse)' }));
    expect(isCoarsePointer()).toBe(true);
  });
});

describe('hapticTick', () => {
  it('vibrates where supported and never throws where it is not', () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal('navigator', { vibrate });
    hapticTick();
    expect(vibrate).toHaveBeenCalledWith(12);
    vi.stubGlobal('navigator', {});
    expect(() => hapticTick()).not.toThrow();
    vi.stubGlobal('navigator', { vibrate: () => { throw new Error('blocked'); } });
    expect(() => hapticTick([10, 40, 10])).not.toThrow();
  });
});
