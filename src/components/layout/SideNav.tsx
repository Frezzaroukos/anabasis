import { NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Wordmark } from '@/components/Logo';
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './navItems';
import { cn } from '@/lib/utils';

/**
 * Πλαϊνή πλοήγηση για tablet/desktop (≥ md).
 *
 * Στο κινητό η εφαρμογή είναι μία στήλη με tabs στο κάτω μέρος — σωστό εκεί,
 * αλλά σε οθόνη 1440px άφηνε μια λωρίδα 448px να αιωρείται σε μαύρο κενό, με
 * nav κινητού κολλημένο στον πάτο. Εδώ ο χώρος υπάρχει, οπότε όλοι οι
 * προορισμοί είναι ορατοί μαζί και το «Περισσότερα» δεν χρειάζεται.
 */
export function SideNav() {
  const { t } = useTranslation();

  return (
    // bg-card πλήρες (όχι border-r): το βήμα φωτεινότητας απέναντι στο
    // bg-background του περιεχομένου αρκεί ως όριο.
    <aside className="sticky top-0 hidden h-screen w-56 shrink-0 flex-col gap-6 overflow-y-auto bg-card px-3 py-6 md:flex lg:w-60">
      <div className="px-2">
        <Wordmark />
      </div>

      <nav className="flex flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <SideLink key={item.to} item={item} label={t(item.labelKey)} />
        ))}
      </nav>

      <nav className="flex flex-col gap-1 border-t border-border/40 pt-4">
        {SECONDARY_NAV.map((item) => (
          <SideLink key={item.to} item={item} label={t(item.labelKey)} />
        ))}
      </nav>
    </aside>
  );
}

function SideLink({ item, label }: { item: NavItem; label: string }) {
  const { to, Icon, end } = item;
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground',
        )
      }
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
    </NavLink>
  );
}
