import { Component, type ReactNode } from 'react';
import { Logo } from './Logo';

interface Props {
  children: ReactNode;
  /** Μήνυμα fallback — δίνεται μεταφρασμένο από τον γονέα. */
  message: string;
  retryLabel: string;
}

interface State {
  error: Error | null;
}

/**
 * Ένα crash σε μία σελίδα δεν πρέπει να ρίχνει όλο το app. Το boundary
 * πιάνει render errors, δείχνει fallback με «δοκίμασε ξανά», και το reset
 * ξαναπροσπαθεί το render (χρήσιμο όταν το σφάλμα ήταν παροδικό, π.χ. δεδομένα
 * υπό φόρτωση). Class component γιατί τα error boundaries ΔΕΝ γίνονται με hooks.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      return (
        // Borderless: το tint bg-destructive/5 αρκεί ως σήμα σφάλματος· το
        // σήμα (mark) ξεθωριασμένο στο βάθος δίνει ταυτότητα χωρίς να
        // ανταγωνίζεται το μήνυμα.
        <div className="relative flex flex-col items-center gap-3 overflow-hidden rounded-lg bg-destructive/5 p-8 text-center">
          <span aria-hidden className="pointer-events-none absolute -bottom-4 -right-4">
            <Logo className="h-24 w-24 text-destructive opacity-[0.06]" />
          </span>
          <p className="relative text-sm font-medium">{this.props.message}</p>
          <p className="relative max-w-xs font-mono text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
          <button
            onClick={this.reset}
            className="relative rounded-md bg-gradient-to-b from-primary to-primary/85 px-4 py-2 text-sm font-medium text-primary-foreground transition-transform active:scale-[0.98]"
          >
            {this.props.retryLabel}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
