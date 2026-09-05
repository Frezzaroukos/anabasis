import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Ο σκελετός του hub των Ρυθμίσεων: ομάδες από σειρές-συνδέσμους.
 *
 * Οι Ρυθμίσεις ήταν μία μακριά στήλη με ανομοιόμορφες κάρτες — έπρεπε να τη
 * σκρολάρεις όλη για να βρεις τι υπάρχει. Ομάδες με σειρές δίνουν μια
 * «σελίδα-περιεχομένων»: βλέπεις σε μια ματιά ΟΛΑ όσα ρυθμίζονται.
 *
 * Κάθε σειρά δείχνει και την τρέχουσα τιμή της, ώστε να μη χρειάζεται να
 * μπεις μέσα για να δεις πώς είναι ρυθμισμένη.
 */
export function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {title}
      </h2>
      <div className="divide-y divide-border/50 overflow-hidden rounded-xl bg-card shadow-elevated">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  to,
  Icon,
  label,
  value,
  hint,
}: {
  to: string;
  Icon: React.ComponentType<{ className?: string }>;
  label: string;
  /** Η τρέχουσα τιμή — `null` όταν δεν υπάρχει ακόμα (ΟΧΙ ψεύτικο μηδέν). */
  value?: string | null;
  hint?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        'flex min-h-[3rem] items-center gap-3 px-4 py-3 text-sm transition-colors duration-150',
        'hover:bg-accent active:bg-accent/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block truncate">{label}</span>
        {hint && <span className="block truncate text-xs text-muted-foreground">{hint}</span>}
      </span>
      {value != null && (
        <span className="max-w-[45%] shrink-0 truncate text-right text-xs text-muted-foreground">
          {value}
        </span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
    </Link>
  );
}

/** Επικεφαλίδα υποσελίδας ρυθμίσεων — τίτλος + μία γραμμή «τι είναι αυτό». */
export function SettingsHeader({ title, description }: { title: string; description?: string }) {
  return (
    <header>
      <h1 className="font-display text-2xl font-semibold tracking-tight">{title}</h1>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
    </header>
  );
}

/**
 * Γέφυρα ανάμεσα στις δύο ταυτότητες (λογαριασμός ↔ προφίλ συσκευής).
 * Υπάρχει επειδή τα δύο μπερδεύονταν: ίδιο όνομα, διαφορετικά πράγματα.
 */
export function CrossLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="flex items-center justify-between gap-2 rounded-lg bg-elevated px-3 py-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <span className="min-w-0 flex-1">{label}</span>
      <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
    </Link>
  );
}
