import { cn } from '@/lib/utils';

/**
 * Κοινά δομικά στοιχεία καρτών.
 *
 * Το app έπασχε από «κουτί-μέσα-σε-κουτί»: κάθε section ήταν το ίδιο
 * `rounded-lg border bg-card p-4` με έναν `h2 text-sm` — μονότονο, χωρίς
 * ιεραρχία. Εδώ κωδικοποιούμε ΕΝΑΝ τρόπο να φτιάχνεις κάρτα, με:
 *  - σταθερό ρυθμό (radius/padding/border),
 *  - «eyebrow» τίτλο (uppercase, tracked) που διαβάζεται ως ετικέτα, όχι
 *    ως επικεφαλίδα κειμένου,
 *  - προαιρετική δράση δεξιά (link «→», φίλτρο κ.λπ.).
 *
 * Έτσι όλες οι κάρτες μοιάζουν συγγενείς αλλά η ματιά βρίσκει αμέσως τον
 * τίτλο και τη δράση.
 */

export function Card({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    // Borderless: το ύψος έρχεται από τη διαφορά φωτεινότητας
    // background→card (βλ. DESIGN-SPEC-V2 «βάθος & επιφάνειες»), όχι από
    // περίγραμμα — shadow-elevated προσθέτει το ελάχιστο ambient lift.
    <section
      className={cn('rounded-xl bg-card p-4 shadow-elevated', className)}
      {...rest}
    >
      {children}
    </section>
  );
}

export function SectionTitle({
  children,
  action,
  className,
}: {
  children: React.ReactNode;
  /** Στοιχείο στα δεξιά — π.χ. «→», ποσοστό, μικρό φίλτρο. */
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('mb-3 flex items-baseline justify-between gap-2', className)}>
      <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {children}
      </h2>
      {action}
    </div>
  );
}

/**
 * Στατιστικό «κελί» — μεγάλος αριθμός εμπρός, μικρή ετικέτα από πάνω.
 * Οι αριθμοί είναι το προϊόν σε μια fitness app· τους αφήνουμε να αναπνεύσουν
 * αντί να τους στριμώχνουμε σε `text-sm`.
 */
export function Stat({
  label,
  value,
  hint,
  tone = 'default',
  className,
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: 'default' | 'up' | 'down';
  className?: string;
}) {
  return (
    <div className={cn('rounded-lg bg-muted/40 px-3 py-2.5', className)}>
      <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          'mt-0.5 font-mono text-xl leading-none',
          // Mono, όχι off-palette hue — «ένα accent» (βλ. brief §4). Το 'up'
          // παίρνει πλήρη έμφαση, το 'down' υποχωρεί ελαφρά.
          tone === 'up' && 'text-foreground',
          tone === 'down' && 'text-muted-foreground',
        )}
      >
        {value}
      </div>
      {hint != null && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}
