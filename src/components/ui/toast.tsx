import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ToastContext, type ToastOptions } from './toast-context';

/**
 * Ένα ελάχιστο toast με ΠΡΟΑΙΡΕΤΙΚΗ ενέργεια («Αναίρεση»).
 *
 * Γιατί υπάρχει: η διαγραφή προπόνησης είναι soft (tombstone) αλλά το UI
 * έφευγε αμέσως μακριά — ο χρήστης δεν είχε τρόπο να αναιρέσει ένα λάθος tap.
 * Εδώ κρατάμε μία μόνο ενεργή ειδοποίηση με σύντομη διάρκεια· όχι ουρά, γιατί
 * δεν υπάρχει σενάριο με πολλαπλές ταυτόχρονες ανακλήσεις στο training flow.
 */
interface ToastState extends ToastOptions {
  id: number;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextId = useRef(0);

  const dismiss = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    setToast(null);
  }, []);

  const showToast = useCallback((opts: ToastOptions) => {
    if (timer.current) clearTimeout(timer.current);
    const id = ++nextId.current;
    setToast({ ...opts, id });
    const duration = opts.durationMs ?? 6000;
    timer.current = setTimeout(() => setToast((cur) => (cur?.id === id ? null : cur)), duration);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const value = useMemo(() => ({ showToast, dismiss }), [showToast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast &&
        createPortal(
          <div
            className="pointer-events-none fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[80] flex justify-center px-4"
            role="status"
            aria-live="polite"
          >
            <div className="pointer-events-auto flex w-full max-w-md animate-in items-center gap-3 rounded-xl border border-border/60 bg-elevated px-4 py-3 shadow-elevated-lg fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none">
              <span className="min-w-0 flex-1 text-sm">{toast.message}</span>
              {toast.actionLabel && toast.onAction && (
                <button
                  type="button"
                  onClick={() => {
                    toast.onAction?.();
                    dismiss();
                  }}
                  className="shrink-0 rounded-md px-2 py-1 text-sm font-semibold text-primary transition-colors hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {toast.actionLabel}
                </button>
              )}
              <button
                type="button"
                onClick={dismiss}
                aria-label="Dismiss"
                className="shrink-0 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                ✕
              </button>
            </div>
          </div>,
          document.body,
        )}
    </ToastContext.Provider>
  );
}
