import { NavLink } from 'react-router-dom';
import { Dumbbell, History, Sparkles, Settings } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface TabDef {
  to: string;
  labelKey: 'workout' | 'history' | 'skills' | 'settings';
  Icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDef[] = [
  { to: '/workout', labelKey: 'workout', Icon: Dumbbell },
  { to: '/history', labelKey: 'history', Icon: History },
  { to: '/skills', labelKey: 'skills', Icon: Sparkles },
  { to: '/settings', labelKey: 'settings', Icon: Settings },
];

export function BottomTabNav() {
  const { t } = useTranslation();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur safe-bottom">
      <ul className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map(({ to, labelKey, Icon }) => (
          <li key={to}>
            <NavLink
              to={to}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors',
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
                  <span>{t(`nav.${labelKey}`)}</span>
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
