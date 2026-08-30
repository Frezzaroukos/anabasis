import {
  Activity,
  CalendarDays,
  ClipboardList,
  Download,
  Mountain,
  Home,
  LineChart,
  ListChecks,
  Scale,
  Settings,
  Sparkles,
  Target,
  User,
} from 'lucide-react';

export interface NavItem {
  to: string;
  labelKey: string;
  Icon: React.ComponentType<{ className?: string }>;
  /** το index route ταιριάζει μόνο ακριβώς, αλλιώς μένει πάντα ενεργό */
  end?: boolean;
}

/**
 * Οι προορισμοί της εφαρμογής, μία φορά.
 *
 * Δύο διαφορετικά nav τα διαβάζουν: το bottom bar στο κινητό (5 + «Περισσότερα»,
 * γιατί δεν χωρούν άλλα) και η πλαϊνή στήλη σε tablet/desktop (όλα μαζί, γιατί
 * εκεί υπάρχει χώρος και το «Περισσότερα» θα ήταν περιττό κλικ).
 * Χωρίς κοινή πηγή, μια νέα σελίδα θα εμφανιζόταν στο ένα και όχι στο άλλο.
 */
export const PRIMARY_NAV: NavItem[] = [
  { to: '/', labelKey: 'nav.home', Icon: Home, end: true },
  { to: '/calendar', labelKey: 'nav.calendar', Icon: CalendarDays },
  { to: '/programs', labelKey: 'nav.programs', Icon: ClipboardList },
  { to: '/exercises', labelKey: 'exercises.title', Icon: ListChecks },
];

/** Ό,τι δεν χωρά στα tabs του κινητού — με σειρά συχνότητας χρήσης. */
export const SECONDARY_NAV: NavItem[] = [
  { to: '/goals', labelKey: 'goals.title', Icon: Target },
  { to: '/progress', labelKey: 'progress.title', Icon: LineChart },
  { to: '/history', labelKey: 'history.title', Icon: Activity },
  { to: '/skills', labelKey: 'nav.skills', Icon: Sparkles },
  { to: '/achievements', labelKey: 'gami.title', Icon: Mountain },
  { to: '/body', labelKey: 'body.title', Icon: Scale },
  { to: '/profile', labelKey: 'nav.profile', Icon: User },
  { to: '/import', labelKey: 'import.title', Icon: Download },
  { to: '/settings', labelKey: 'nav.settings', Icon: Settings },
];
