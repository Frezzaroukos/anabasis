/* eslint-disable react-refresh/only-export-components -- the palette intentionally ships its context hook and pure matchers with the UI. */
import {
  createContext,
  lazy,
  Suspense,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

// Search helpers μένουν στο ελαφρύ commandSearch module — το βαρύ dialog
// (icons + entries + focus trap) φορτώνεται μόνο όταν ανοίξει η παλέτα.
export { fuzzyScore, normalizeSearch } from './commandSearch';

type CommandGroup = 'nav' | 'settings' | 'actions';

export interface CommandCopy {
  title: string;
  search: string;
  placeholder: string;
  groups: Record<CommandGroup, string>;
  noResults: string;
  move: string;
  open: string;
  close: string;
}

const COPY: Record<'el' | 'en', CommandCopy> = {
  el: {
    title: 'Αναζήτηση & εντολές',
    search: 'Αναζήτηση',
    placeholder: 'Αναζήτηση σελίδων και ενεργειών…',
    groups: { nav: 'Πλοήγηση', settings: 'Ρυθμίσεις', actions: 'Ενέργειες' },
    noResults: 'Τίποτα δεν ταιριάζει. Δοκίμασε άλλη λέξη.',
    move: 'περιήγηση',
    open: 'άνοιγμα',
    close: 'κλείσιμο',
  },
  en: {
    title: 'Search & commands',
    search: 'Search',
    placeholder: 'Search pages and actions…',
    groups: { nav: 'Navigate', settings: 'Settings', actions: 'Actions' },
    noResults: 'Nothing matches. Try another word.',
    move: 'move',
    open: 'open',
    close: 'close',
  },
};

export function commandShortcut(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
}

function copyFor(language: string | undefined): CommandCopy {
  return language?.toLowerCase().startsWith('el') ? COPY.el : COPY.en;
}

const CommandMenuDialog = lazy(() =>
  import('./CommandMenuDialog').then((m) => ({ default: m.CommandMenuDialog })),
);

interface CommandMenuContextValue {
  open: () => void;
  close: () => void;
  isOpen: boolean;
  copy: CommandCopy;
}

const CommandMenuContext = createContext<CommandMenuContextValue | null>(null);

export function useCommandMenu(): CommandMenuContextValue {
  const context = useContext(CommandMenuContext);
  if (!context) throw new Error('useCommandMenu must be used inside CommandMenuProvider');
  return context;
}

export function CommandMenuProvider({ children }: { children: ReactNode }) {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const copy = useMemo(() => copyFor(i18n.resolvedLanguage), [i18n.resolvedLanguage]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.altKey || event.shiftKey) return;
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() !== 'k') return;
      // Μην στοιβάζεις παλέτα πάνω σε άλλο modal (sheet/dialog) — δύο traps
      // και δύο Escape listeners ταυτόχρονα μπερδεύουν focus και πλοήγηση.
      const openDialog = document.querySelector<HTMLElement>('[aria-modal="true"]');
      if (openDialog && !openDialog.hasAttribute('data-command-menu')) return;
      event.preventDefault();
      setIsOpen((current) => !current);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ open, close, isOpen, copy }),
    [open, close, isOpen, copy],
  );

  return (
    <CommandMenuContext.Provider value={value}>
      {children}
      {isOpen && (
        <Suspense fallback={null}>
          <CommandMenuDialog copy={copy} onClose={close} />
        </Suspense>
      )}
    </CommandMenuContext.Provider>
  );
}
