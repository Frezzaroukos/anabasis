import * as React from 'react';
import { cn } from '@/lib/utils';

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        // bg-elevated αντί για λευκό πλαίσιο — το βάθος δείχνει το πεδίο, όχι
        // μια γραμμή γύρω του (βλ. DESIGN-SPEC-V2 «βάθος & επιφάνειες»).
        'flex h-10 w-full rounded-md bg-elevated px-3 py-2 text-sm text-foreground',
        'ring-offset-background transition-colors',
        'placeholder:text-muted-foreground',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
