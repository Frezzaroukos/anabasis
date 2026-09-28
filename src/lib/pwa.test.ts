import { describe, expect, it, vi } from 'vitest';
import { reloadOnServiceWorkerUpdate } from './pwa';

function serviceWorker(controlled: boolean) {
  let listener: (() => void) | undefined;
  return {
    value: {
      controller: controlled ? ({} as ServiceWorker) : null,
      addEventListener: (_type: string, fn: EventListenerOrEventListenerObject) => {
        listener = fn as () => void;
      },
    },
    change: () => listener?.(),
  };
}

describe('reloadOnServiceWorkerUpdate', () => {
  it('does not reload when the service worker takes control for the first time', () => {
    const sw = serviceWorker(false);
    const reload = vi.fn();
    reloadOnServiceWorkerUpdate(sw.value, reload);
    sw.change();
    expect(reload).not.toHaveBeenCalled();
  });

  it('reloads an already-controlled page once after an update', () => {
    const sw = serviceWorker(true);
    const reload = vi.fn();
    reloadOnServiceWorkerUpdate(sw.value, reload);
    sw.change();
    sw.change();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
