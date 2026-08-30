import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Play } from 'lucide-react';

/**
 * Η πρωταρχική δράση της εφαρμογής.
 *
 * Δεν μπορεί να κρυφτεί από τις ρυθμίσεις (βλ. LOCKED_VISIBLE στο cards.ts):
 * μια Αρχική χωρίς τρόπο να ξεκινήσεις προπόνηση είναι αδιέξοδο, και καμία
 * ρύθμιση δεν επιτρέπεται να οδηγεί εκεί. Μετακινείται όμως ελεύθερα.
 *
 * Ο υπότιτλος ΔΕΝ επαναλαμβάνει πια «X μέρες αυτή την εβδομάδα» — αυτό το
 * fact το δείχνει ήδη το hero από πάνω (de-dupe, ARCHITECTURE-V4 §6).
 */
export function StartWorkoutCta() {
  const { t } = useTranslation();

  return (
    <Link
      to="/calendar"
      className="flex items-center justify-between gap-3 rounded-xl bg-primary px-5 py-4 text-primary-foreground shadow-glow-sm ring-offset-background transition-all duration-200 hover:shadow-glow active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <span>
        <span className="block text-lg font-semibold">{t('dashboard.startCta')}</span>
        <span className="block text-xs opacity-70">{t('dashboard.startSub')}</span>
      </span>
      {/* Το εικονίδιο επιβεβαιώνει τη δράση — δεν διεκδικεί την προσοχή. */}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
        <Play className="h-4 w-4 fill-current" />
      </span>
    </Link>
  );
}
