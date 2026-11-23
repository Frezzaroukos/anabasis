import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface StepperFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'children'> {
  /** Ορατή ετικέτα πάνω από το πεδίο (το input κρατά το δικό του aria-label). */
  label: string;
  /** Τι γράφουν τα κουμπιά, π.χ. «−2.5» / «+2.5». */
  decText: string;
  incText: string;
  /** Προσβάσιμα ονόματα, π.χ. «−2.5 kg». */
  decLabel: string;
  incLabel: string;
  onStep: (direction: -1 | 1) => void;
  /** Μήνυμα σφάλματος κάτω από το πεδίο (ήδη με id/role από τον caller). */
  error?: ReactNode;
}

const stepButton =
  'flex h-11 w-11 shrink-0 items-center justify-center border border-input bg-background/60 font-mono text-sm tabular-nums text-muted-foreground transition-colors hover:bg-accent hover:text-foreground active:bg-accent active:text-foreground focus-visible:relative focus-visible:z-10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';

/**
 * [−] πεδίο [+] — στο γυμναστήριο τα περισσότερα σετ είναι «ίδιο βάρος, μία
 * επανάληψη λιγότερη»: ένα tap στο − αντί για πληκτρολόγιο που σκεπάζει μισή
 * οθόνη. Τα κουμπιά είναι 44×44 (στόχος αφής), το πεδίο μένει πληκτρολογήσιμο.
 *
 * Div αντί για <label>: ένα <label> θα «έδενε» με το πρώτο labelable παιδί του —
 * το κουμπί «−» — και ένα tap στην ετικέτα θα αφαιρούσε βάρος.
 */
export const StepperField = forwardRef<HTMLInputElement, StepperFieldProps>(
  ({ label, decText, incText, decLabel, incLabel, onStep, error, className, ...inputProps }, ref) => (
    <div className="flex min-w-0 flex-1 flex-col gap-1">
      <span className="truncate text-xs uppercase tracking-wide text-muted-foreground" aria-hidden>
        {label}
      </span>
      <div className="flex min-w-0 items-stretch">
        <button
          type="button"
          aria-label={decLabel}
          onClick={() => onStep(-1)}
          className={cn(stepButton, 'rounded-l-md border-r-0')}
        >
          {decText}
        </button>
        <Input
          ref={ref}
          {...inputProps}
          className={cn(
            'h-11 min-w-0 flex-1 rounded-none px-1 text-center font-mono text-base tabular-nums',
            className,
          )}
        />
        <button
          type="button"
          aria-label={incLabel}
          onClick={() => onStep(1)}
          className={cn(stepButton, 'rounded-r-md border-l-0')}
        >
          {incText}
        </button>
      </div>
      {error}
    </div>
  ),
);
StepperField.displayName = 'StepperField';
