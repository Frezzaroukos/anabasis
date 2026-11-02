import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export function ProgressHistoryTabs() {
  const { t } = useTranslation();
  const tabs = [
    { to: '/progress', label: t('progress.byExercise') },
    { to: '/history', label: t('history.title') },
  ];

  return (
    <nav
      aria-label={t('progress.title')}
      className="grid grid-cols-2 gap-1 rounded-lg bg-elevated p-1"
    >
      {tabs.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              'rounded-md px-3 py-2 text-center text-xs font-medium transition-colors duration-150',
              'focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
              isActive
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )
          }
        >
          {tab.label}
        </NavLink>
      ))}
    </nav>
  );
}
