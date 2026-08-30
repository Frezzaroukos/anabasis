import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { getActiveLadder } from '@/lib/db/queries';
import { cn } from '@/lib/utils';

/**
 * Το hero του dashboard: η σκάλα του skill που δουλεύεις τώρα.
 *
 * Οι generic gym apps δείχνουν πρώτα «όγκο» και «σετ». Το Anabasis δείχνει
 * πρώτα ΠΟΥ ΕΙΣΑΙ στην αλυσίδα — tuck → advanced tuck → straddle → full —
 * γιατί αυτό είναι το ερώτημα που έχει ο αθλητής όταν ανοίγει το app.
 *
 * Τα κλειδωμένα βήματα ΜΕΝΟΥΝ ορατά (με λουκέτο): βλέπεις τον δρόμο, όχι
 * μόνο το σκαλί σου. Δεν εμφανίζεται καθόλου αν δεν υπάρχει ενεργό skill —
 * μια άδεια σκάλα θα ήταν διακόσμηση.
 */
export function SkillLadderCard() {
  const { t } = useTranslation();
  const ladder = useLiveQuery(() => getActiveLadder(), [], null);

  if (!ladder) return null;

  return (
    <Link
      to={`/skills/${ladder.skillId}`}
      className="block overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-card to-card p-4 ring-offset-background transition-all duration-150 hover:via-elevated hover:to-elevated active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
          {t('dashboard.skillLadder')}
        </span>
        <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
          {t('dashboard.viewAll')}
          <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>

      <h2 className="text-2xl font-semibold tracking-tight">{ladder.skillName}</h2>
      <p className="mt-0.5 text-xs text-muted-foreground">
        {t('dashboard.ladderProgress', { done: ladder.done, total: ladder.total })}
      </p>

      {/* Οριζόντια σκάλα: κουκκίδα ανά βήμα, γραμμή σύνδεσης, ετικέτα κάτω.
          `basis-0` + `min-w-0`: τα βήματα μοιράζονται ΙΣΑ το πλάτος και
          συρρικνώνονται — με min-width το 5ο βήμα κοβόταν στα 390px. */}
      <ol className="mt-4 flex gap-0.5">
        {ladder.steps.map((s, i) => (
          <li key={s.id} className="flex min-w-0 flex-1 basis-0 flex-col items-center gap-1.5">
            <div className="flex w-full items-center">
              {/* γραμμή προς τα αριστερά */}
              <span
                className={cn(
                  'h-px flex-1',
                  i === 0 ? 'bg-transparent' : s.state === 'locked' ? 'bg-border' : 'bg-primary/60',
                )}
              />
              <span
                className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium',
                  s.state === 'done' && 'border-primary/60 bg-primary/15 text-primary',
                  s.state === 'current' &&
                    'animate-ladder-step border-primary bg-primary text-primary-foreground',
                  s.state === 'locked' && 'border-border bg-muted/40 text-muted-foreground',
                )}
              >
                {s.state === 'done' ? (
                  <Check className="h-4 w-4" />
                ) : s.state === 'locked' ? (
                  <Lock className="h-3 w-3" />
                ) : (
                  s.stepNumber
                )}
              </span>
              <span
                className={cn(
                  'h-px flex-1',
                  i === ladder.steps.length - 1
                    ? 'bg-transparent'
                    : ladder.steps[i + 1]!.state === 'locked'
                      ? 'bg-border'
                      : 'bg-primary/60',
                )}
              />
            </div>
            <span
              className={cn(
                'line-clamp-2 w-full text-balance px-0.5 text-center text-[9px] leading-tight',
                s.state === 'current' ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.name}
            </span>
          </li>
        ))}
      </ol>
    </Link>
  );
}
