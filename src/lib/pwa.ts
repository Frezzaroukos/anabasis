/**
 * Reload once when an already-controlled page receives an updated service
 * worker. The first install also emits `controllerchange`; reloading there
 * wastes the whole first-load path and can trap slow devices in a double boot.
 */
export function reloadOnServiceWorkerUpdate(
  serviceWorker: Pick<ServiceWorkerContainer, 'controller' | 'addEventListener'>,
  reload: () => void,
): void {
  const wasControlled = serviceWorker.controller !== null;
  let reloaded = false;
  serviceWorker.addEventListener('controllerchange', () => {
    if (!wasControlled || reloaded) return;
    reloaded = true;
    reload();
  });
}
