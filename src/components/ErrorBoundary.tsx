import { Component, type ReactNode } from 'react';

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
        <div className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
          <p className="text-sm font-medium">{this.props.message}</p>
          <p className="max-w-xs font-mono text-xs text-muted-foreground">
            {this.state.error.message}
          </p>
          <button
            onClick={this.reset}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            {this.props.retryLabel}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
