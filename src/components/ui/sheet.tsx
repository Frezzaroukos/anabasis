import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/utils';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBackToClose } from '@/hooks/useBackToClose';
import { usePresence } from '@/hooks/usePresence';

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
  const titleId = React.useId();
  const { mounted, closing } = usePresence(open);
  useFocusTrap(panelRef, open && mounted);
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

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex flex-col md:items-center md:justify-center md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title != null ? titleId : undefined}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className={cn(
          'absolute inset-0 bg-black/45',
          closing
            ? 'animate-out fade-out-0 duration-200 motion-reduce:animate-none'
            : 'animate-in fade-in duration-200 motion-reduce:animate-none',
        )}
      />
      {/* bg-elevated: το sheet ανεβαίνει πάνω από την κάρτα — βάθος, όχι
          περίγραμμα γύρω-γύρω, αλλά ένα hairline top border το κόβει καθαρά
          πάνω από το θολωμένο backdrop. */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={cn(
          'rounded-t-3xl border-t border-border/60 bg-elevated shadow-elevated-lg',
          'relative z-10 mt-auto flex max-h-[92dvh] w-full landscape:max-h-[94dvh] flex-col safe-bottom',
          'md:mt-0 md:max-h-[86dvh] md:max-w-2xl md:rounded-2xl md:border',
          closing
            ? 'animate-out slide-out-to-bottom duration-200 motion-reduce:animate-none'
            : 'animate-in slide-in-from-bottom duration-200 motion-reduce:animate-none',
          'focus:outline-hidden',
          className,
        )}
      >
        <div className="flex items-center justify-center pt-2 md:hidden">
          <span className="h-1 w-10 rounded-full bg-muted" aria-hidden />
        </div>
        {title != null && (
          <div id={titleId} className="border-b border-border/40 px-4 pb-2 pt-3 text-base font-semibold">
            {title}
          </div>
        )}
        <div className="flex-1 overflow-y-auto overscroll-contain">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
