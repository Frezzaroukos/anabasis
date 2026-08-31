import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { createActivity, updateActivity } from '@/lib/db/queries';
import type { Activity } from '@/lib/db/types';
import { ACTIVITY_ICONS, ACTIVITY_ICON_NAMES } from '@/components/activityIcon';
import { ACTIVITY_DOT_COLORS } from '../utils';

interface ActivityFormSheetProps {
  open: boolean;
  onClose: () => void;
  /** Δίνεται μόνο σε επεξεργασία — η δημιουργία δεν έχει `activity`. */
  activity?: Activity | null;
}

const DEFAULTS = {
  icon: 'dumbbell',
  dot_class: ACTIVITY_DOT_COLORS[0],
};

/**
 * Φόρμα δραστηριότητας — δημιουργία ΚΑΙ επεξεργασία (και των builtin).
 * Ελεύθερο emoji αντί για λίστα εικονιδίων: ο χρήστης γράφει ό,τι θέλει.
 */
export function ActivityFormSheet({ open, onClose, activity = null }: ActivityFormSheetProps) {
  const { t } = useTranslation();
  const [label, setLabel] = useState('');
  const [icon, setIcon] = useState(DEFAULTS.icon);
  const [dotClass, setDotClass] = useState<string>(DEFAULTS.dot_class);
  const [usesSets, setUsesSets] = useState(false);
  const [tracksDistance, setTracksDistance] = useState(false);
  const [busy, setBusy] = useState(false);

  // Ξαναγεμίζει τη φόρμα κάθε φορά που ανοίγει (νέα δραστηριότητα ή edit).
  useEffect(() => {
    if (!open) return;
    setLabel(activity?.label ?? '');
    setIcon(activity?.icon ?? DEFAULTS.icon);
    setDotClass(activity?.dot_class ?? DEFAULTS.dot_class);
    setUsesSets(activity?.uses_sets ?? false);
    setTracksDistance(activity?.tracks_distance ?? false);
  }, [open, activity]);

  const valid = label.trim() !== '';

  const onSubmit = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const patch = {
        label: label.trim(),
        icon: icon.trim() || DEFAULTS.icon,
        dot_class: dotClass,
        uses_sets: usesSets,
        tracks_distance: tracksDistance,
      };
      if (activity) {
        await updateActivity(activity.id, patch);
      } else {
        await createActivity(patch);
      }
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={activity ? t('activities.edit') : t('activities.new')}
    >
      <div className="space-y-4 px-4 pb-6">
        {/*
          Το όνομα πρώτο και μόνο του. Το πεδίο συμβόλου έπιανε την πρώτη θέση
          ενώ το σύμβολο δεν εμφανίζεται πλέον πουθενά — η ταυτότητα της
          δραστηριότητας είναι το ΧΡΩΜΑ (παρακάτω), που φαίνεται στο ημερολόγιο
          και στα chips επιλογής.
        */}
        <div className="flex items-end gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('activities.label')}
            </span>
            <Input
              autoFocus
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('activities.labelPlaceholder')}
              className="h-10"
            />
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('activities.icon')}
          </span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('activities.icon')}>
            {ACTIVITY_ICON_NAMES.map((name) => {
              const Icon = ACTIVITY_ICONS[name]!;
              const active = icon === name;
              return (
                <button
                  key={name}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={name}
                  onClick={() => setIcon(name)}
                  className={cn(
                    'flex h-9 w-9 items-center justify-center rounded-md border transition-colors',
                    active
                      ? 'border-primary bg-primary/10 text-foreground'
                      : 'border-border/70 text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden />
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('activities.color')}
          </span>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t('activities.color')}>
            {ACTIVITY_DOT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={dotClass === c}
                aria-label={c}
                onClick={() => setDotClass(c)}
                className={cn(
                  'h-7 w-7 rounded-full ring-offset-2 ring-offset-card transition-shadow',
                  c,
                  dotClass === c && 'ring-2 ring-foreground',
                )}
              />
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
          <div>
            <p className="text-sm">{t('activities.usesSets')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('activities.usesSetsHint')}</p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={usesSets}
            aria-label={t('activities.usesSets')}
            onClick={() => setUsesSets((v) => !v)}
            className={cn(
              'h-6 w-11 shrink-0 rounded-full border border-border transition-colors',
              usesSets ? 'bg-primary' : 'bg-muted',
            )}
          >
            <span
              className={cn(
                'block h-4 w-4 rounded-full bg-background transition-transform',
                usesSets ? 'translate-x-6' : 'translate-x-1',
              )}
            />
          </button>
        </div>

        {!usesSets && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
            <p className="text-sm">{t('activities.tracksDistance')}</p>
            <button
              type="button"
              role="switch"
              aria-checked={tracksDistance}
              aria-label={t('activities.tracksDistance')}
              onClick={() => setTracksDistance((v) => !v)}
              className={cn(
                'h-6 w-11 shrink-0 rounded-full border border-border transition-colors',
                tracksDistance ? 'bg-primary' : 'bg-muted',
              )}
            >
              <span
                className={cn(
                  'block h-4 w-4 rounded-full bg-background transition-transform',
                  tracksDistance ? 'translate-x-6' : 'translate-x-1',
                )}
              />
            </button>
          </div>
        )}

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" disabled={!valid || busy} onClick={() => void onSubmit()}>
            {t('activities.save')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('activities.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
