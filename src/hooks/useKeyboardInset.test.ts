import { describe, expect, it } from 'vitest';
import { keyboardInset } from './useKeyboardInset';

describe('keyboardInset', () => {
  it('0 with no keyboard (visual = layout viewport)', () => {
    expect(keyboardInset({ height: 844, offsetTop: 0 }, 844)).toBe(0);
  });

  it('the keyboard height when the visual viewport shrinks (Android resizes-visual / iOS)', () => {
    expect(keyboardInset({ height: 490, offsetTop: 0 }, 844)).toBe(354);
  });

  it('subtracts a panned visual viewport (iOS scrolls it to reveal the field)', () => {
    expect(keyboardInset({ height: 490, offsetTop: 120 }, 844)).toBe(234);
  });

  it('ignores toolbar-sized changes and pinch-zoom', () => {
    expect(keyboardInset({ height: 800, offsetTop: 0 }, 844)).toBe(0);
    expect(keyboardInset({ height: 422, offsetTop: 0, scale: 2 }, 844)).toBe(0);
  });
});
