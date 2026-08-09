import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Play } from 'lucide-react';
import { getTrainingSummary } from '@/lib/db/queries';

/**
 * Η πρωταρχική δράση της εφαρμογής.
 *
 * Δεν μπορεί να κρυφτεί από τις ρυθμίσεις (βλ. LOCKED_VISIBLE στο cards.ts):
 * μια Αρχική χωρίς τρόπο να ξεκινήσεις προπόνηση είναι αδιέξοδο, και καμία
 * ρύθμιση δεν επιτρέπεται να οδηγεί εκεί. Μετακινείται όμως ελεύθερα.
 */
export function StartWorkoutCta() {
  const { t } = useTranslation();
  const summary7 = useLiveQuery(() => getTrainingSummary(7), [], null);
  const activeDays = summary7?.activeDays ?? 0;

  return (
    <Link
      to="/workout"
      className="flex items-center justify-between gap-3 rounded-xl bg-primary px-5 py-4 text-primary-foreground shadow-sm transition-transform active:scale-[0.99]"
    >
      <span>
        <span className="block text-lg font-semibold">{t('dashboard.startCta')}</span>
        <span className="block text-xs opacity-70">
          {activeDays > 0
            ? t('dashboard.activeThisWeek', { count: activeDays })
            : t('dashboard.startSub')}
        </span>
      </span>
      {/* Το εικονίδιο επιβεβαιώνει τη δράση — δεν διεκδικεί την προσοχή. */}
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-foreground/15">
        <Play className="h-4 w-4 fill-current" />
      </span>
    </Link>
  );
}
