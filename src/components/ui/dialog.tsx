import * as React from 'react';
import { createPortal } from 'react-dom';
import { Button } from './button';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { useBackToClose } from '@/hooks/useBackToClose';
import { usePresence } from '@/hooks/usePresence';

interface ConfirmDialogProps {
  open: boolean;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel: React.ReactNode;
  cancelLabel: React.ReactNode;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  destructive,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const { mounted, closing } = usePresence(open);
  useFocusTrap(panelRef, open && mounted);
  useBackToClose(open, onCancel);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close"
        onClick={onCancel}
        className={`absolute inset-0 bg-black/45 ${
          closing
            ? 'animate-out fade-out-0 duration-200 motion-reduce:animate-none'
            : 'animate-in fade-in duration-200 motion-reduce:animate-none'
        }`}
      />
      {/* bg-elevated: το dialog είναι το πιο «ψηλό» επίπεδο — βάθος, όχι
          περίγραμμα, αλλά ένα hairline border/60 το κόβει καθαρά πάνω από το
          θολωμένο backdrop (κανόνας 3 του brief). */}
      <div
        ref={panelRef}
        tabIndex={-1}
        className={`relative z-10 w-full max-w-sm rounded-xl border border-border/60 bg-elevated p-5 shadow-elevated-lg duration-200 focus:outline-hidden ${
          closing
            ? 'animate-out fade-out-0 zoom-out-95 motion-reduce:animate-none'
            : 'animate-in fade-in zoom-in-95 motion-reduce:animate-none'
        }`}
      >
        <p id={titleId} className="text-base font-semibold">{title}</p>
        {description != null && (
          <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
