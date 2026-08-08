import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Activity,
  CalendarDays,
  ClipboardList,
  Download,
  Dumbbell,
  Home,
  LineChart,
  ListChecks,
  MoreHorizontal,
  Scale,
  Settings,
  Sparkles,
  User,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { BottomSheet } from '@/components/ui/sheet';

interface TabDef {
  to: string;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** το index route ταιριάζει μόνο ακριβώς, αλλιώς μένει πάντα ενεργό */
  end?: boolean;
}

/**
 * Πέντε tabs + «Περισσότερα».
 *
 * Ήταν έξι ισότιμα tabs: σε 390px έπεφταν ~65px το καθένα, οι ελληνικές
 * ετικέτες κόβονταν, και ΠΑΡΑ ΤΑΥΤΑ οι μισές σελίδες (Σώμα, Ιστορικό,
 * Πρόοδος, Ασκήσεις…) δεν είχαν καθόλου θέση — ζούσαν ως μια σειρά από
 * μικρά κουμπάκια στην Αρχική. Πέντε tabs για ό,τι αγγίζεις καθημερινά,
 * ένα φύλλο για τα υπόλοιπα.
 */
const TABS: TabDef[] = [
  { to: '/', labelKey: 'nav.home', Icon: Home, end: true },
  { to: '/workout', labelKey: 'nav.workout', Icon: Dumbbell },
  { to: '/calendar', labelKey: 'nav.calendar', Icon: CalendarDays },
  { to: '/skills', labelKey: 'nav.skills', Icon: Sparkles },
];

/** Ό,τι δεν χωρά στα tabs — με σειρά συχνότητας χρήσης. */
const MORE: TabDef[] = [
  { to: '/programs', labelKey: 'nav.programs', Icon: ClipboardList },
  { to: '/progress', labelKey: 'progress.title', Icon: LineChart },
  { to: '/history', labelKey: 'history.title', Icon: Activity },
  { to: '/body', labelKey: 'body.title', Icon: Scale },
  { to: '/exercises', labelKey: 'exercises.title', Icon: ListChecks },
  { to: '/profile', labelKey: 'nav.profile', Icon: User },
  { to: '/import', labelKey: 'import.title', Icon: Download },
  { to: '/settings', labelKey: 'nav.settings', Icon: Settings },
];

export function BottomTabNav() {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();

  const go = (to: string) => {
    setMoreOpen(false);
    navigate(to);
  };

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur safe-bottom">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map(({ to, labelKey, Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  cn(
                    'relative flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
                    isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    {/* δείκτης πάνω από το εικονίδιο — το χρώμα μόνο του
                        δεν αρκεί σε colour-blind χρήστες */}
                    <span
                      className={cn(
                        'absolute inset-x-4 top-0 h-0.5 rounded-full transition-opacity',
                        isActive ? 'bg-primary opacity-100' : 'opacity-0',
                      )}
                    />
                    <Icon className="h-5 w-5" />
                    <span className="w-full truncate px-0.5 text-center">{t(labelKey)}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
          <li>
            <button
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={cn(
                'flex w-full flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
                moreOpen ? 'text-primary' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <MoreHorizontal className="h-5 w-5" />
              <span className="w-full truncate px-0.5 text-center">{t('nav.more')}</span>
            </button>
          </li>
        </ul>
      </nav>

      <BottomSheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('nav.more')}>
        <ul className="grid grid-cols-2 gap-2 px-4 pb-4">
          {MORE.map(({ to, labelKey, Icon }) => (
            <li key={to}>
              <button
                onClick={() => go(to)}
                className="flex w-full items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-3 text-left text-sm transition-colors hover:bg-accent"
              >
                <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="truncate">{t(labelKey)}</span>
              </button>
            </li>
          ))}
        </ul>
      </BottomSheet>
    </>
  );
}
