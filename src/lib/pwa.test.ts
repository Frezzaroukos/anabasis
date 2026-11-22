import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from './db/schema';
import { endWorkout, getActiveWorkout, startWorkout } from './db/queries';
import { setCurrentUserId } from './db/session';
import { reloadOnServiceWorkerUpdate, showVersionRefreshToast } from './pwa';

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

  it('does not reload while a workout is open, and offers refresh once', async () => {
    const sw = serviceWorker(true);
    const reload = vi.fn();
    const onDefer = vi.fn();
    reloadOnServiceWorkerUpdate(sw.value, reload, {
      shouldReload: async () => false,
      onDefer,
    });
    sw.change();
    sw.change();
    await vi.waitFor(() => expect(onDefer).toHaveBeenCalledTimes(1));
    expect(reload).not.toHaveBeenCalled();
  });

  it('still reloads once when no workout is open', async () => {
    const sw = serviceWorker(true);
    const reload = vi.fn();
    const onDefer = vi.fn();
    reloadOnServiceWorkerUpdate(sw.value, reload, {
      shouldReload: async () => true,
      onDefer,
    });
    sw.change();
    sw.change();
    await vi.waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(onDefer).not.toHaveBeenCalled();
  });
});

describe('active workout blocks the automatic refresh', () => {
  beforeEach(async () => {
    setCurrentUserId('pwa-refresh');
    await db.workouts.clear();
  });

  it('sees an open workout and stops seeing it after it ends', async () => {
    expect(await getActiveWorkout()).toBeUndefined();
    const workout = await startWorkout('strength');
    expect(await getActiveWorkout()).not.toBeUndefined();
    await endWorkout(workout.id);
    expect(await getActiveWorkout()).toBeUndefined();
  });
});

describe('showVersionRefreshToast', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('shows one refresh control and reloads only when it is used', () => {
    const reload = vi.fn();
    showVersionRefreshToast(reload);
    showVersionRefreshToast(reload);
    const buttons = document.querySelectorAll('#anabasis-sw-update');
    expect(buttons).toHaveLength(1);
    expect(buttons[0]?.textContent).toBe('Νέα έκδοση — Ανανέωση');
    (buttons[0] as HTMLButtonElement).click();
    expect(reload).toHaveBeenCalledTimes(1);
  });
});
