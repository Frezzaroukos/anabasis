import { Link } from 'react-router-dom';
import { LOGO_VARIANTS } from '@/components/LogoVariants';
import { ACCENTS } from '@/lib/theme';

/**
 * Preview logo + accent — ώστε ο Aggelos να διαλέξει από iPhone (μέσω του
 * https link) ποιο κρατάμε, χωρίς εξωτερικά εργαλεία. Προσωρινή σελίδα:
 * μόλις κλειδώσει το logo, την αφαιρούμε.
 */
export function BrandingPage() {
  return (
    <div className="space-y-8">
      <header>
        <Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Logo & Brand</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Διάλεξε logo — αλλάζει και με το accent χρώμα (Ρυθμίσεις → Accent). Πες μου ποιο.
        </p>
      </header>

      <section className="space-y-4">
        {LOGO_VARIANTS.map(({ key, label, Comp }) => (
          <div key={key} className="rounded-xl border border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-sm font-medium">{label}</span>
              <code className="text-[11px] text-muted-foreground">{key}</code>
            </div>
            <div className="flex items-center gap-6">
              {/* Σε accent χρώμα */}
              <Comp className="h-16 w-16 text-primary" />
              {/* Σε μονόχρωμο (favicon test) */}
              <Comp className="h-10 w-10 text-foreground" />
              {/* Μικρό (24px — bottom nav test) */}
              <Comp className="h-6 w-6 text-primary" />
              {/* Σε rounded container (app icon) */}
              <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
                <Comp className="h-10 w-10 text-primary-foreground" />
              </span>
            </div>
          </div>
        ))}
      </section>

      <section>
        <p className="mb-2 text-sm font-medium">Accent παλέτα (δοκίμασέ τα)</p>
        <div className="flex flex-wrap gap-2">
          {ACCENTS.map((a) => (
            <span
              key={a.key}
              className="h-8 w-8 rounded-full"
              style={{ background: a.swatch }}
              title={a.label}
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Άλλαξέ τα από Ρυθμίσεις → Accent και δες πώς κάθεται το logo.
        </p>
      </section>
    </div>
  );
}
