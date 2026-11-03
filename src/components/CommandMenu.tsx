/* eslint-disable react-refresh/only-export-components -- the palette intentionally ships its context hook and pure matchers with the UI. */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Cloud,
  CornerDownLeft,
  Database,
  Download,
  HelpCircle,
  Info,
  MessageSquare,
  Palette,
  Play,
  Search,
  Sparkles,
  Timer,
  X,
} from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/utils';
import { PRIMARY_NAV, SECONDARY_NAV } from '@/components/layout/navItems';

type CommandGroup = 'nav' | 'settings' | 'actions';

interface CommandEntry {
  id: string;
  to: string;
  labelKey: string;
  Icon: ComponentType<{ className?: string }>;
  group: CommandGroup;
  keywords?: string;
}

interface IndexedEntry {
  entry: CommandEntry;
  index: number;
}

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

const GROUP_ORDER: CommandGroup[] = ['nav', 'settings', 'actions'];

const SETTINGS_ENTRIES: CommandEntry[] = [
  {
    id: 'settings-account',
    to: '/settings/account',
    labelKey: 'settings.account',
    Icon: Cloud,
    group: 'settings',
    keywords: 'account email sync login συνδεση λογαριασμος',
  },
  {
    id: 'settings-appearance',
    to: '/settings/appearance',
    labelKey: 'settings.appearance',
    Icon: Palette,
    group: 'settings',
    keywords: 'theme accent language dark light εμφανιση γλωσσα',
  },
  {
    id: 'settings-training',
    to: '/settings/training',
    labelKey: 'settings.training',
    Icon: Timer,
    group: 'settings',
    keywords: 'units rest timer training μοναδες προπονηση',
  },
  {
    id: 'settings-data',
    to: '/settings/data',
    labelKey: 'settings.data',
    Icon: Database,
    group: 'settings',
    keywords: 'backup export import data δεδομενα αντιγραφο',
  },
  {
    id: 'settings-about',
    to: '/settings/about',
    labelKey: 'settings.about',
    Icon: Info,
    group: 'settings',
    keywords: 'about share creator σχετικα δημιουργος',
  },
];

const ACTION_ENTRIES: CommandEntry[] = [
  {
    id: 'action-start-workout',
    to: '/calendar',
    labelKey: 'workout.start',
    Icon: Play,
    group: 'actions',
    keywords: 'start workout train new session calendar training εναρξη προπονηση ημερολογιο',
  },
  {
    id: 'action-import',
    to: '/import',
    labelKey: 'import.title',
    Icon: Download,
    group: 'actions',
    keywords: 'import backup restore notion strong hevy εισαγωγη αντιγραφο',
  },
  {
    id: 'action-help',
    to: '/help',
    labelKey: 'help.title',
    Icon: HelpCircle,
    group: 'actions',
    keywords: 'faq support questions βοηθεια ερωτησεις',
  },
  {
    id: 'action-feedback',
    to: '/feedback',
    labelKey: 'feedback.title',
    Icon: MessageSquare,
    group: 'actions',
    keywords: 'bug idea message contact σφαλμα ιδεα επικοινωνια',
  },
  {
    id: 'action-changelog',
    to: '/whats-new',
    labelKey: 'changelog.title',
    Icon: Sparkles,
    group: 'actions',
    keywords: 'changelog changes releases notes new τι νεο ενημερωσεις',
  },
];

const COMMAND_ENTRIES: CommandEntry[] = [
  ...PRIMARY_NAV.map((item, index) => ({
    id: `nav-primary-${index}`,
    to: item.to,
    labelKey: item.labelKey,
    Icon: item.Icon,
    group: 'nav' as const,
  })),
  ...SECONDARY_NAV.map((item, index) => ({
    id: `nav-secondary-${index}`,
    to: item.to,
    labelKey: item.labelKey,
    Icon: item.Icon,
    group: 'nav' as const,
  })),
  ...SETTINGS_ENTRIES,
  ...ACTION_ENTRIES,
];

export function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/ς/g, 'σ')
    .replace(/[’']/g, '');
}

function scoreToken(token: string, haystack: string): number {
  const direct = haystack.indexOf(token);
  if (direct >= 0) {
    const atWordStart = direct === 0 || /[\s\-_/(]/.test(haystack[direct - 1]!);
    return 100 + (atWordStart ? 20 : 0) - Math.min(direct, 40);
  }

  let queryIndex = 0;
  let streak = 0;
  let score = 0;
  for (let i = 0; i < haystack.length && queryIndex < token.length; i += 1) {
    if (haystack[i] !== token[queryIndex]) {
      streak = 0;
      continue;
    }
    score += 1 + streak * 2;
    if (i === 0 || /[\s\-_/(]/.test(haystack[i - 1]!)) score += 3;
    streak += 1;
    queryIndex += 1;
  }
  return queryIndex === token.length ? score : 0;
}

export function fuzzyScore(query: string, text: string): number {
  const normalizedQuery = normalizeSearch(query).trim();
  if (!normalizedQuery) return 1;
  const haystack = normalizeSearch(text);
  let total = 0;
  for (const token of normalizedQuery.split(/\s+/)) {
    const tokenScore = scoreToken(token, haystack);
    if (tokenScore === 0) return 0;
    total += tokenScore;
  }
  return total;
}

export function commandShortcut(): string {
  if (typeof navigator === 'undefined') return 'Ctrl K';
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform) ? '⌘K' : 'Ctrl K';
}

function copyFor(language: string | undefined): CommandCopy {
  return language?.toLowerCase().startsWith('el') ? COPY.el : COPY.en;
}

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
      {isOpen && <CommandMenuDialog copy={copy} onClose={close} />}
    </CommandMenuContext.Provider>
  );
}

function CommandMenuDialog({ copy, onClose }: { copy: CommandCopy; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const panelRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  useFocusTrap(panelRef, true);

  const entries = useMemo(
    () =>
      COMMAND_ENTRIES.map((entry, order) => ({
        entry,
        order,
        searchText: [
          i18n.t(entry.labelKey, { lng: 'el' }),
          i18n.t(entry.labelKey, { lng: 'en' }),
          entry.keywords ?? '',
          entry.to,
        ].join(' '),
      })),
    [i18n],
  );

  const ranked = useMemo(() => {
    if (!query.trim()) return entries;
    return entries
      .map((item) => ({ ...item, score: fuzzyScore(query, item.searchText) }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.order - b.order);
  }, [entries, query]);

  const groups = useMemo(() => {
    let index = 0;
    return GROUP_ORDER.map((group) => {
      const items: IndexedEntry[] = ranked
        .filter((item) => item.entry.group === group)
        .map((item) => ({ entry: item.entry, index: index++ }));
      return { group, items };
    }).filter((group) => group.items.length > 0);
  }, [ranked]);

  const flat = useMemo(() => groups.flatMap((group) => group.items), [groups]);
  const activeIndex = flat.length === 0 ? -1 : Math.min(active, flat.length - 1);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    if (activeIndex < 0) return;
    document
      .getElementById(`${listId}-option-${activeIndex}`)
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [activeIndex, listId]);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const run = useCallback(
    (entry: CommandEntry) => {
      onClose();
      navigate(entry.to);
    },
    [navigate, onClose],
  );

  const onInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!flat.length) return;
      setActive((current) => (current + 1) % flat.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!flat.length) return;
      setActive((current) => (current - 1 + flat.length) % flat.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setActive(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setActive(Math.max(0, flat.length - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const selected = flat[activeIndex];
      if (selected) run(selected.entry);
    }
  };

  const listboxId = `${listId}-listbox`;

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center p-3 pt-[max(12vh,env(safe-area-inset-top))] sm:p-6 sm:pt-[16vh]">
      <button
        type="button"
        aria-label={copy.close}
        onClick={onClose}
        className="absolute inset-0 bg-black/45 animate-in fade-in duration-200 motion-reduce:animate-none"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={copy.title}
        data-command-menu
        tabIndex={-1}
        className={cn(
          'relative z-10 flex max-h-[min(80dvh,34rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl border border-border/60 bg-elevated shadow-elevated-lg',
          'animate-in fade-in zoom-in-95 slide-in-from-top-2 duration-200 motion-reduce:animate-none',
          'focus:outline-hidden',
        )}
      >
        <div className="flex items-center gap-2 border-b border-border/60 px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onInputKeyDown}
            aria-label={copy.search}
            aria-controls={listboxId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={
              activeIndex >= 0 ? `${listId}-option-${activeIndex}` : undefined
            }
            role="combobox"
            autoComplete="off"
            spellCheck={false}
            placeholder={copy.placeholder}
            className="h-12 min-w-0 flex-1 bg-transparent text-base text-foreground outline-hidden placeholder:text-muted-foreground sm:text-sm"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={copy.close}
            className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <div
          id={listboxId}
          role="listbox"
          aria-label={copy.title}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
        >
          {flat.length === 0 ? (
            <p role="status" className="px-3 py-10 text-center text-sm text-muted-foreground">
              {copy.noResults}
            </p>
          ) : (
            groups.map((group) => (
              <div
                key={group.group}
                role="group"
                aria-labelledby={`${listId}-group-${group.group}`}
              >
                <p
                  id={`${listId}-group-${group.group}`}
                  className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground"
                >
                  {copy.groups[group.group]}
                </p>
                {group.items.map(({ entry, index }) => {
                  const { Icon } = entry;
                  const selected = index === activeIndex;
                  return (
                    <div
                      key={entry.id}
                      id={`${listId}-option-${index}`}
                      role="option"
                      aria-selected={selected}
                      tabIndex={-1}
                      onMouseMove={() => {
                        if (activeIndex !== index) setActive(index);
                      }}
                      onClick={() => run(entry)}
                      className={cn(
                        'flex min-h-10 cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors duration-100',
                        selected
                          ? 'bg-primary/10 text-foreground'
                          : 'text-muted-foreground hover:bg-accent hover:text-foreground',
                      )}
                    >
                      <Icon
                        className={cn('h-4 w-4 shrink-0', selected && 'text-primary')}
                      />
                      <span className="min-w-0 flex-1 truncate">{t(entry.labelKey)}</span>
                      {selected && (
                        <CornerDownLeft
                          className="h-3.5 w-3.5 shrink-0 text-primary/70"
                          aria-hidden
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <div className="hidden items-center gap-4 border-t border-border/50 px-3 py-2 text-[11px] text-muted-foreground sm:flex">
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-card px-1 font-mono">↑</kbd>
            <kbd className="rounded border border-border/60 bg-card px-1 font-mono">↓</kbd>
            {copy.move}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-card px-1 font-mono">↵</kbd>
            {copy.open}
          </span>
          <span className="flex items-center gap-1">
            <kbd className="rounded border border-border/60 bg-card px-1 font-mono">esc</kbd>
            {copy.close}
          </span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
