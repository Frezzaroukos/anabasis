import { createContext, useContext } from 'react';

/**
 * Το context του toast — ξεχωριστό από το component γιατί το fast-refresh
 * του Vite απαιτεί τα αρχεία components να εξάγουν ΜΟΝΟ components.
 */
export interface ToastOptions {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  durationMs?: number;
}

export interface ToastContextValue {
  showToast: (opts: ToastOptions) => void;
  dismiss: () => void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
