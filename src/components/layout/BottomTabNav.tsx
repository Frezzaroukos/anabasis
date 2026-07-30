import { NavLink } from 'react-router-dom';
import {
  CalendarDays,
  ClipboardList,
  Dumbbell,
  Home,
  Sparkles,
  Settings,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface TabDef {
  to: string;
  labelKey: 'home' | 'workout' | 'programs' | 'calendar' | 'skills' | 'settings';
  Icon: React.ComponentType<{ className?: string }>;
  /** το index route ταιριάζει μόνο ακριβώς, αλλιώς μένει πάντα ενεργό */
  end?: boolean;
}

/**
 * Έξι tabs είναι το όριο για οθόνη κινητού. Το «Ιστορικό» βγήκε από εδώ γιατί
 * το Ημερολόγιο απαντά την ίδια ερώτηση («τι έκανα και πότε») πιο οπτικά —
 * παραμένει προσβάσιμο από το Ημερολόγιο και την Αρχική.
 */
const TABS: TabDef[] = [
  { to: '/', labelKey: 'home', Icon: Home, end: true },
  { to: '/workout', labelKey: 'workout', Icon: Dumbbell },
  { to: '/programs', labelKey: 'programs', Icon: ClipboardList },
  { to: '/calendar', labelKey: 'calendar', Icon: CalendarDays },
  { to: '/skills', labelKey: 'skills', Icon: Sparkles },
  { to: '/settings', labelKey: 'settings', Icon: Settings },
];

export function BottomTabNav() {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur safe-bottom">
      <ul className="mx-auto grid max-w-md grid-cols-6">
        {TABS.map(({ to, labelKey, Icon, end }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 py-2 text-[10px] font-medium transition-colors',
                  isActive
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground',
                )
              }
            >
              {({ isActive }) => (
                <>
                  <Icon
                    className={cn(
                      'h-5 w-5 transition-transform',
                      isActive && 'scale-110',
                    )}
                  />
                  {/* truncate: καμία ετικέτα δεν επιτρέπεται να τυλίξει και να
                      σπρώξει τα εικονίδια — 6 tabs σε 390px αφήνουν ~65px */}
                  <span className="w-full truncate px-0.5 text-center">
                    {t(`nav.${labelKey}`)}
                  </span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
