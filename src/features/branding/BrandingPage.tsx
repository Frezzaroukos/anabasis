import { Link } from 'react-router-dom';
import { Logo } from '@/components/Logo';
import { ACCENTS } from '@/lib/theme';

/**
 * Εσωτερική σελίδα σύγκρισης σημάτων — ΔΕΝ είναι λειτουργία της εφαρμογής.
 *
 * Ο σύνδεσμος αφαιρέθηκε από τις Ρυθμίσεις: το λογότυπο κλείδωσε, και ένας
 * χρήστης που ανοίγει «Ρυθμίσεις» δεν έχει λόγο να δει υποψήφια logos.
 * Η διαδρομή /branding μένει για να μπορούμε να συγκρίνουμε αν ξαναγγίξουμε
 * το σήμα. V5: το ενεργό σήμα είναι το «Ascent A» (branding/logo-v2/mark.svg).
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
          Daylight + Ascent A — το ενεργό σήμα + η παλέτα.
        </p>
      </header>

      <section className="rounded-xl bg-card p-6">
        <p className="mb-4 text-sm font-medium">Ascent A — ενεργό σήμα</p>
        <div className="flex flex-wrap items-center gap-8">
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-16 w-16 text-primary" />
            <span className="text-xs text-muted-foreground">accent (currentColor)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-16 w-16" gradient />
            <span className="text-xs text-muted-foreground">Violet gradient</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-16 w-16 text-primary" summit />
            <span className="text-xs text-muted-foreground">summit (achievement)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            {/* Πραγματικό αρχείο — αυτό ακριβώς σερβίρεται ως PWA/app icon */}
            <img src="/app-icon.svg?v=3" alt="Anabasis app icon" className="h-16 w-16 rounded-2xl" />
            <span className="text-xs text-muted-foreground">app icon (πραγματικό αρχείο)</span>
          </div>
          <div className="flex flex-col items-center gap-2">
            <Logo className="h-6 w-6 text-primary" />
            <span className="text-xs text-muted-foreground">24px (bottom nav)</span>
          </div>
        </div>
      </section>

      <section>
        <p className="mb-3 text-sm font-medium">Violet — παλέτα</p>
        <div className="flex flex-wrap gap-4">
          {PALETTE.map((p) => (
            <div key={p.key} className="flex flex-col items-center gap-1.5">
              <span className={`h-12 w-12 rounded-lg ${p.cls}`} />
              <span className="text-xs text-muted-foreground">{p.label}</span>
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

    </div>
  );
}
