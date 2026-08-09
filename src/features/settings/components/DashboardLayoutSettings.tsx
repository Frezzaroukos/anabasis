import { useTranslation } from 'react-i18next';
import { ChevronDown, ChevronUp, Lock } from 'lucide-react';
import { updateSettings } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import {
  CARD_LABEL,
  LOCKED_VISIBLE,
  resolveCardOrder,
  type CardPref,
  type DashboardCardKey,
} from '@/features/dashboard/cards';
import { cn } from '@/lib/utils';

/**
 * «Η δική μου Αρχική»: ποιες κάρτες βλέπω και με ποια σειρά.
 *
 * Ο ίδιος πίνακας εξυπηρετεί και τα δύο, γιατί είναι η ίδια ερώτηση —
 * «τι θέλω να βλέπω πρώτο». Δύο χωριστές λίστες (μία για ορατότητα, μία για
 * σειρά) θα ζητούσαν από τον χρήστη να κρατά στο μυαλό του τη σύνδεση.
 *
 * Γράφουμε ΠΑΝΤΑ την πλήρη, επιλυμένη λίστα — έτσι μια μελλοντική κάρτα
 * μπαίνει στο τέλος αντί να «αιωρείται» χωρίς θέση.
 */
export function DashboardLayoutSettings() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const order = resolveCardOrder(settings?.dashboard_cards);

  const save = (next: CardPref[]) => void updateSettings({ dashboard_cards: next });

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= order.length) return;
    const next = [...order];
    const a = next[index];
    const b = next[target];
    if (!a || !b) return;
    next[index] = b;
    next[target] = a;
    save(next);
  };

  const toggle = (index: number) => {
    const card = order[index];
    if (!card || LOCKED_VISIBLE.includes(card.key as DashboardCardKey)) return;
    const next = [...order];
    next[index] = { ...card, visible: !card.visible };
    save(next);
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <p className="text-sm font-medium">{t('settings.dashboardLayout')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('settings.dashboardLayoutHint')}</p>

      <ul className="mt-3 divide-y divide-border/60">
        {order.map(({ key, visible }, index) => {
          const locked = LOCKED_VISIBLE.includes(key as DashboardCardKey);
          return (
            <li key={key} className="flex items-center gap-2 py-2">
              {/* 44px στόχος αφής ανά βελάκι — σε κινητό τα 20px κουμπάκια
                  αστοχούν συνέχεια. Το εικονίδιο μένει μικρό, η περιοχή όχι. */}
              <div className="flex shrink-0 flex-col">
                <button
                  onClick={() => move(index, -1)}
                  disabled={index === 0}
                  aria-label={t('goals.moveUp')}
                  className="flex h-9 w-11 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => move(index, 1)}
                  disabled={index === order.length - 1}
                  aria-label={t('goals.moveDown')}
                  className="flex h-9 w-11 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>

              <span
                className={cn(
                  'min-w-0 flex-1 truncate text-sm',
                  !visible && 'text-muted-foreground line-through',
                )}
              >
                {t(CARD_LABEL[key as DashboardCardKey])}
              </span>

              {locked ? (
                <span
                  className="shrink-0 text-muted-foreground"
                  title={t('settings.dashboardLocked')}
                >
                  <Lock className="h-3.5 w-3.5" />
                </span>
              ) : (
                <button
                  role="switch"
                  aria-checked={visible}
                  aria-label={t(CARD_LABEL[key as DashboardCardKey])}
                  onClick={() => toggle(index)}
                  className={cn(
                    'relative h-6 w-11 shrink-0 rounded-full transition-colors',
                    visible ? 'bg-primary' : 'bg-muted',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-background transition-transform',
                      visible ? 'translate-x-[22px]' : 'translate-x-0.5',
                    )}
                  />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
