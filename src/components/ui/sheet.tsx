import * as React from 'react';
import { cn } from '@/lib/utils';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  title?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/** Minimal bottom sheet: backdrop + slide-up panel. Closes on backdrop / Escape. */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
  className,
}: BottomSheetProps) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex flex-col" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="flex-1 bg-black/60 animate-in fade-in"
      />
      <div
        className={cn(
          'rounded-t-2xl border-t border-border bg-card shadow-2xl',
          'flex max-h-[85vh] flex-col safe-bottom animate-in slide-in-from-bottom',
          className,
        )}
      >
        <div className="flex items-center justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-muted" aria-hidden />
        </div>
        {title != null && (
          <div className="px-4 pb-2 pt-3 text-base font-semibold">{title}</div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
