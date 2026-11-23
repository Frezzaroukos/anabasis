import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import { useKeepAboveKeyboard } from './useKeepAboveKeyboard';

/** Ψεύτικο visualViewport: το jsdom δεν έχει πληκτρολόγιο ούτε layout. */
function fakeViewport(height: number) {
  const target = new EventTarget() as EventTarget & { height: number; offsetTop: number };
  target.height = height;
  target.offsetTop = 0;
  vi.stubGlobal('visualViewport', target);
  return target;
}

function Harness({ buttonBottom }: { buttonBottom: number }) {
  const formRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  useKeepAboveKeyboard(formRef, buttonRef);
  return (
    <div data-testid="scroller" style={{ overflowY: 'auto' }}>
      <div ref={formRef}>
        <input aria-label="reps" />
        <button
          ref={(el) => {
            buttonRef.current = el;
            if (el) el.getBoundingClientRect = () => ({ bottom: buttonBottom } as DOMRect);
          }}
        >
          Add set
        </button>
      </div>
    </div>
  );
}

function prepScroller() {
  const scroller = screen.getByTestId('scroller');
  Object.defineProperty(scroller, 'scrollHeight', { value: 2000 });
  Object.defineProperty(scroller, 'clientHeight', { value: 800 });
  const scrollBy = vi.fn();
  scroller.scrollBy = scrollBy as unknown as typeof scroller.scrollBy;
  return scrollBy;
}

afterEach(() => vi.unstubAllGlobals());

describe('useKeepAboveKeyboard', () => {
  it('scrolls just enough to lift the button above the keyboard while typing', () => {
    const vv = fakeViewport(844);
    render(<Harness buttonBottom={700} />);
    const scrollBy = prepScroller();
    screen.getByLabelText('reps').focus();
    vv.height = 490; // keyboard opens
    act(() => { vv.dispatchEvent(new Event('resize')); });
    expect(scrollBy).toHaveBeenCalledWith({ top: 218, behavior: 'auto' });
  });

  it('does nothing when the button is already visible', () => {
    const vv = fakeViewport(844);
    render(<Harness buttonBottom={400} />);
    const scrollBy = prepScroller();
    screen.getByLabelText('reps').focus();
    vv.height = 490;
    act(() => { vv.dispatchEvent(new Event('resize')); });
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('ignores viewport changes when no field in the form is being edited', () => {
    const vv = fakeViewport(844);
    render(<Harness buttonBottom={700} />);
    const scrollBy = prepScroller();
    vv.height = 490;
    act(() => { vv.dispatchEvent(new Event('resize')); });
    expect(scrollBy).not.toHaveBeenCalled();
  });

  it('re-checks after focus once the keyboard animation has settled', () => {
    vi.useFakeTimers();
    const vv = fakeViewport(490); // keyboard already open (switching fields)
    render(<Harness buttonBottom={700} />);
    const scrollBy = prepScroller();
    act(() => { screen.getByLabelText('reps').focus(); });
    expect(scrollBy).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(400); });
    expect(scrollBy).toHaveBeenCalledWith({ top: 218, behavior: 'auto' });
    vi.useRealTimers();
    void vv;
  });
});
