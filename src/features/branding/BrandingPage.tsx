import { Link } from 'react-router-dom';
import { LOGO_VARIANTS } from '@/components/LogoVariants';
import { Logo } from '@/components/Logo';
import { ACCENTS } from '@/lib/theme';

/**
 * Εσωτερική σελίδα σύγκρισης σημάτων — ΔΕΝ είναι λειτουργία της εφαρμογής.
 *
 * Ο σύνδεσμος αφαιρέθηκε από τις Ρυθμίσεις: το λογότυπο κλείδωσε, και ένας
 * χρήστης που ανοίγει «Ρυθμίσεις» δεν έχει λόγο να δει υποψήφια logos.
 * Η διαδρομή /branding μένει για να μπορούμε να συγκρίνουμε αν ξαναγγίξουμε
 * το σήμα. V2: το ενεργό σήμα είναι το «rung-peak» (docs/DESIGN-SPEC-V2.md).
 */

const PALETTE = [
  { key: 'base', label: 'bg-base', cls: 'bg-background' },
  { key: 'surface', label: 'bg-surface', cls: 'bg-card' },
  { key: 'elevated', label: 'bg-elevated', cls: 'bg-elevated' },
  { key: 'accent', label: 'accent', cls: 'bg-primary' },
  { key: 'gold', label: 'gold (achievement)', cls: 'bg-gold' },
] as const;

export function BrandingPage() {
  return (
    <div className="space-y-10">
      <header>
        <Link to="/settings" className="text-xs text-muted-foreground hover:text-foreground">
          ← Settings
        </Link>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight">Logo & Brand</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Altitude Violet — το ενεργό σήμα («rung-peak») + η παλέτα. Ιστορικές εκδοχές
          παρακάτω, μόνο για σύγκριση.
        </p>
      </header>

      <section className="rounded-xl bg-card p-6">
        <p className="mb-4 text-sm font-medium">Rung-peak — ενεργό σήμα</p>
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-16 w-16 text-primary" />
            <span className="text-[11px] text-muted-foreground">accent (currentColor)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-16 w-16" gradient />
            <span className="text-[11px] text-muted-foreground">Altitude Violet gradient</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-16 w-16 text-primary" summit />
            <span className="text-[11px] text-muted-foreground">summit (achievement)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            {/* Πραγματικό αρχείο — αυτό ακριβώς σερβίρεται ως PWA/app icon */}
            <img src="/app-icon.svg" alt="Anabasis app icon" className="h-16 w-16 rounded-2xl" />
            <span className="text-[11px] text-muted-foreground">app icon (bg-base)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-6 w-6 text-primary" />
            <span className="text-[11px] text-muted-foreground">24px (bottom nav)</span>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-3 text-sm font-medium">Altitude Violet — παλέτα</p>
        <div className="flex flex-wrap gap-4">
          {PALETTE.map((p) => (
            <div key={p.key} className="flex flex-col items-center gap-1.5">
              <span className={`h-12 w-12 rounded-lg ${p.cls}`} />
              <span className="text-[11px] text-muted-foreground">{p.label}</span>
            </div>
          ))}
        </div>
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

      <section className="space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Ιστορικές εκδοχές (σύγκριση)</p>
        {LOGO_VARIANTS.map(({ key, label, Comp }) => (
          <div key={key} className="rounded-xl bg-card p-5">
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
    </div>
  );
}
