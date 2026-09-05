import * as React from 'react';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBackToClose } from '@/hooks/useBackToClose';

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
  const panelRef = React.useRef<HTMLDivElement>(null);
  useFocusTrap(panelRef, open);
  useBackToClose(open, onClose);

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
        className="flex-1 bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
      />
      {/* bg-elevated: το sheet ανεβαίνει πάνω από την κάρτα — βάθος, όχι
          περίγραμμα γύρω-γύρω, αλλά ένα hairline top border το κόβει καθαρά
          πάνω από το θολωμένο backdrop. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'rounded-t-2xl border-t border-border/60 bg-elevated shadow-elevated-lg',
          'flex max-h-[85vh] flex-col safe-bottom animate-in slide-in-from-bottom duration-200',
          'focus:outline-none',
          className,
        )}
      >
        <div className="flex items-center justify-center pt-2">
          <span className="h-1 w-10 rounded-full bg-muted" aria-hidden />
        </div>
        {title != null && (
          <div className="border-b border-border/40 px-4 pb-2 pt-3 text-base font-semibold">
            {title}
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
