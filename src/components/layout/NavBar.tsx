import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useHistoryNav } from '@/hooks/useHistoryNav';
import { parentRouteOf } from './parentRoute';

/**
 * Λωρίδα πλοήγησης στην κορυφή — πίσω/μπροστά.
 *
 * Υπάρχει γιατί στην εγκατεστημένη PWA και στο Tauri desktop δεν υπάρχει
 * browser back. Στο iOS standalone δεν υπάρχει ούτε swipe-back, οπότε χωρίς
 * αυτό μια σελίδα βάθους κλείνει μόνο με τα bottom tabs.
 *
 * Το κουμπί «μπροστά» εμφανίζεται ΜΟΝΟ όταν όντως υπάρχει κάτι μπροστά —
 * ένα μονίμως απενεργοποιημένο βέλος είναι θόρυβος, όχι πληροφορία.
 *
 * Η λωρίδα υπάρχει πάντα ως δοχείο (κρατά το safe-area padding του notch)
 * αλλά μένει κενή όταν δεν έχει τίποτα να δείξει.
 */
export function NavBar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { canGoBack, canGoForward, goBack, goForward } = useHistoryNav();

  const parent = parentRouteOf(pathname);
  const back = canGoBack
    ? { label: t('nav.back'), go: goBack }
    : parent
      ? { label: t(parent.labelKey), go: () => navigate(parent.to) }
      : null;

  return (
    <div className="sticky top-0 z-30 bg-background/95 backdrop-blur safe-top">
      <div className="mx-auto flex w-full max-w-md items-center justify-between px-2 md:max-w-4xl md:px-6 lg:max-w-5xl">
        {back && (
          <button
            type="button"
            onClick={back.go}
            className="-ml-1 flex h-11 items-center gap-0.5 rounded-lg pl-1 pr-3 text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" aria-hidden />
            <span className="max-w-[12rem] truncate">{back.label}</span>
          </button>
        )}
        {canGoForward && (
          <button
            type="button"
            onClick={goForward}
            aria-label={t('nav.forward')}
            className="-mr-1 ml-auto flex h-11 w-11 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:text-foreground active:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ChevronRight className="h-5 w-5" aria-hidden />
          </button>
        )}
      </div>
    </div>
  );
}
