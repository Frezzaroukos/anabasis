/**
 * Reload once when an already-controlled page receives an updated service
 * worker. The first install also emits `controllerchange`; reloading there
 * wastes the whole first-load path and can trap slow devices in a double boot.
 *
 * `shouldReload` runs at most once. When it returns false (an open workout
 * still has unsaved input in memory), `onDefer` runs instead of `reload` so
 * the page is not torn down. A second `controllerchange` does not ask again.
 */
export function reloadOnServiceWorkerUpdate(
  serviceWorker: Pick<ServiceWorkerContainer, 'controller' | 'addEventListener'>,
  reload: () => void,
  options?: {
    shouldReload?: () => boolean | Promise<boolean>;
    onDefer?: () => void;
  },
): void {
  const wasControlled = serviceWorker.controller !== null;
  let decided = false;
  serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled || decided) return;
    const gate = options?.shouldReload;
    if (!gate) {
      decided = true;
      reload();
      return;
    }
    decided = true;
    void Promise.resolve()
      .then(gate)
      .then((ok) => {
        if (ok) reload();
        else options?.onDefer?.();
      })
      .catch(() => {
        // A failed check must not reload over an unknown workout, and must
        // not leave the listener able to fire the reload again.
      });
  });
}

const UPDATE_TOAST_ID = 'anabasis-sw-update';

/** One explicit refresh control. Clicking it is the only reload. */
export function showVersionRefreshToast(reload: () => void): void {
  if (typeof document === 'undefined') return;
  if (document.getElementById(UPDATE_TOAST_ID)) return;
  const button = document.createElement('button');
  button.id = UPDATE_TOAST_ID;
  button.type = 'button';
  button.textContent = 'Νέα έκδοση — Ανανέωση';
  button.style.position = 'fixed';
  button.style.right = '1rem';
  button.style.bottom = '1rem';
  button.style.zIndex = '9999';
  button.addEventListener('click', () => reload());
  document.body.append(button);
}
