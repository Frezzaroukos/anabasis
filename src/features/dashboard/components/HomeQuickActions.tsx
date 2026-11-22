import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClipboardPaste, Scale } from 'lucide-react';
import { localDay } from '@/lib/db/queries';
import { QuickPasteWorkoutSheet } from '@/features/workout/components/QuickPasteWorkoutSheet';
import { QuickWeightSheet } from './QuickWeightSheet';

const actionClass =
  'flex h-11 items-center justify-center gap-2 rounded-xl bg-card px-3 text-sm font-medium text-foreground ring-offset-background transition-colors hover:bg-elevated focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';

/** Δύο καθημερινές ενέργειες δίπλα στην έναρξη: βάρος και επικόλληση σημειώσεων. */
export function HomeQuickActions() {
  const { t } = useTranslation();
  const today = localDay();
  const [weightOpen, setWeightOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={actionClass} onClick={() => setWeightOpen(true)}>
          <Scale className="h-4 w-4 text-primary" aria-hidden />
          {t('dashboard.logWeight')}
        </button>
        <button type="button" className={actionClass} onClick={() => setPasteOpen(true)}>
          <ClipboardPaste className="h-4 w-4 text-primary" aria-hidden />
          {t('dashboard.quickPaste')}
        </button>
      </div>
      <QuickWeightSheet open={weightOpen} onClose={() => setWeightOpen(false)} />
      <QuickPasteWorkoutSheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        initialDate={today}
      />
    </>
  );
}
