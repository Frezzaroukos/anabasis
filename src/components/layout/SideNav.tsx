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
          'relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card',
          isActive
            ? 'bg-primary/10 font-medium text-primary'
            : 'text-muted-foreground hover:bg-accent hover:text-foreground active:bg-accent/80',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* Ίδια «rung» γλώσσα με το bottom-nav — accent ράβδος στο ενεργό
              στοιχείο, ώστε κινητό/desktop chrome να μιλάνε το ίδιο λεξιλόγιο. */}
          <span
            className={cn(
              'absolute inset-y-2 left-0 w-[2px] rounded-full bg-primary transition-opacity duration-150',
              isActive ? 'opacity-100 shadow-glow-sm' : 'opacity-0',
            )}
            aria-hidden
          />
          <Icon className="h-4 w-4 shrink-0" />
          <span className="truncate">{label}</span>
        </>
      )}
    </NavLink>
  );
}
