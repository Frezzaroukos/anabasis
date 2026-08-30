import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // active:scale = «πάτημα» αισθητό στο χέρι· focus-visible:shadow-glow-sm
  // βαθαίνει το ring σε ελαφριά λάμψη αντί για ξερό contour.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:shadow-glow-sm disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        // Απαλή διαβάθμιση αντί για επίπεδο γέμισμα — το κύριο κουμπί «αναπνέει».
        // shadow-sm σε ηρεμία, glow στο hover: το ίδιο ring token απλά βαθαίνει.
        default:
          'bg-gradient-to-b from-primary to-primary/85 text-primary-foreground shadow-sm hover:opacity-90 hover:shadow-glow-sm',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-accent',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        destructive:
          'bg-destructive text-destructive-foreground hover:opacity-90',
        outline:
          'border border-input bg-background hover:border-foreground/20 hover:bg-accent hover:text-accent-foreground',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-9 rounded-md px-3',
        lg: 'h-12 rounded-md px-6 text-base',
        icon: 'h-10 w-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

// buttonVariants είναι το καθιερωμένο shadcn/ui pattern (variant helper δίπλα
// στο component). Το fast-refresh warning είναι αναμενόμενο εδώ και ακίνδυνο.
// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants };
