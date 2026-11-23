import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { BottomSheet } from './sheet';

function fakeViewport(height: number) {
  const vv = new EventTarget() as EventTarget & { height: number; offsetTop: number; scale: number };
  vv.height = height;
  vv.offsetTop = 0;
  vv.scale = 1;
  vi.stubGlobal('visualViewport', vv);
  return vv;
}

afterEach(() => vi.unstubAllGlobals());

describe('BottomSheet — soft keyboard', () => {
  it('sits above the keyboard while it is open, back to the bottom when it closes', () => {
    const layout = window.innerHeight;
    const vv = fakeViewport(layout);
    render(
      <BottomSheet open onClose={() => {}} title="Bodyweight">
        <input aria-label="kg" />
        <button type="button">Save</button>
      </BottomSheet>,
    );
    const root = screen.getByRole('dialog');
    expect(root.style.bottom).toBe('');

    vv.height = layout - 300; // keyboard up
    act(() => { vv.dispatchEvent(new Event('resize')); });
    expect(root.style.bottom).toBe('300px');
    expect(root.getAttribute('data-keyboard-inset')).toBe('300');

    vv.height = layout; // keyboard down
    act(() => { vv.dispatchEvent(new Event('resize')); });
    expect(root.style.bottom).toBe('');
  });

  it('does nothing without visualViewport (old browsers / desktop webviews)', () => {
    vi.stubGlobal('visualViewport', undefined);
    render(
      <BottomSheet open onClose={() => {}} title="x">
        <p>body</p>
      </BottomSheet>,
    );
    expect(screen.getByRole('dialog').style.bottom).toBe('');
  });
});
