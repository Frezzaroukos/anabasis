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
        // μια γραμμή γύρω του (βλ. DESIGN-SPEC-V2 «βάθος & επιφάνειες»). Ένα
        // hairline border(transparent→border) δίνει ελαφρύ crisp περίγραμμα
        // στο hover/focus χωρίς να σπάει το borderless ηρεμία σε idle state.
        // 16px στο κινητό (text-base) ώστε το iOS να ΜΗΝ ζουμάρει σε κάθε tap
        // σε πεδίο (~40 taps/προπόνηση)· 14px από sm και πάνω για πυκνότητα.
        'flex h-10 w-full rounded-md border border-transparent bg-elevated px-3 py-2 text-base sm:text-sm text-foreground',
        'ring-offset-background transition-colors duration-150',
        'placeholder:text-muted-foreground',
        'hover:border-border/70',
        'focus-visible:border-ring/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
