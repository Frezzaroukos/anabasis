import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, ChevronRight, Lock } from 'lucide-react';
import { getActiveLadder } from '@/lib/db/queries';
import { cn } from '@/lib/utils';

const EDGE_FADE = '1.25rem';

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

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
  const railRef = useRef<HTMLOListElement>(null);
  const currentRef = useRef<HTMLLIElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });
  const currentId = ladder?.steps.find((s) => s.state === 'current')?.id ?? null;

  // Το τρέχον σκαλί μένει στο κέντρο του rail όταν δεν χωράνε όλα.
  useEffect(() => {
    const rail = railRef.current;
    const item = currentRef.current;
    if (!rail || !item || rail.scrollWidth <= rail.clientWidth + 1) return;
    const railRect = rail.getBoundingClientRect();
    const itemRect = item.getBoundingClientRect();
    const left =
      rail.scrollLeft + itemRect.left - railRect.left - (rail.clientWidth - itemRect.width) / 2;
    const max = rail.scrollWidth - rail.clientWidth;
    rail.scrollTo({
      left: Math.min(max, Math.max(0, left)),
      behavior: scrollBehavior(),
    });
  }, [currentId]);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const update = () => {
      const max = rail.scrollWidth - rail.clientWidth;
      const left = rail.scrollLeft > 2;
      const right = max > 2 && rail.scrollLeft < max - 2;
      setEdges((prev) =>
        prev.left === left && prev.right === right ? prev : { left, right },
      );
    };
    update();
    rail.addEventListener('scroll', update, { passive: true });
    const observer =
      typeof ResizeObserver === 'function' ? new ResizeObserver(update) : null;
    observer?.observe(rail);
    window.addEventListener('resize', update);
    return () => {
      rail.removeEventListener('scroll', update);
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, [ladder?.skillId, ladder?.steps.length]);

  const maskImage =
    edges.left && edges.right
      ? `linear-gradient(to right, transparent 0, #000 ${EDGE_FADE}, #000 calc(100% - ${EDGE_FADE}), transparent 100%)`
      : edges.right
        ? `linear-gradient(to right, #000 0, #000 calc(100% - ${EDGE_FADE}), transparent 100%)`
        : edges.left
          ? `linear-gradient(to right, transparent 0, #000 ${EDGE_FADE}, #000 100%)`
          : undefined;

  if (!ladder) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLAnchorElement>) => {
    const rail = railRef.current;
    if (!rail || rail.scrollWidth <= rail.clientWidth + 1) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    rail.scrollBy({
      left: (event.key === 'ArrowLeft' ? -1 : 1) * Math.max(72, rail.clientWidth * 0.6),
      behavior: scrollBehavior(),
    });
  };

  return (
    <Link
      to={`/skills/${ladder.skillId}`}
      onKeyDown={onKeyDown}
      className="block overflow-hidden rounded-xl bg-gradient-to-br from-primary/10 via-card to-card p-4 ring-offset-background transition-all duration-150 hover:via-elevated hover:to-elevated active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-[0.08em] text-primary">
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

      {/* Στενό: οριζόντιο snap rail με ελάχιστο πλάτος ανά σκαλί· ≥sm μοιράζεται
          ίσα όπως πριν. Οι γραμμές μένουν μέσα σε κάθε σκαλί, χωρίς κενό. */}
      <ol
        ref={railRef}
        className={cn(
          'mt-4 flex snap-x snap-mandatory gap-0 overflow-x-auto overscroll-x-contain',
          '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:gap-0.5 sm:snap-none sm:overflow-visible',
        )}
        style={{ maskImage, WebkitMaskImage: maskImage }}
      >
        {ladder.steps.map((s, i) => (
          <li
            key={s.id}
            ref={s.state === 'current' ? currentRef : undefined}
            className="flex min-w-[4rem] flex-1 basis-0 snap-center flex-col items-center gap-1.5 sm:min-w-0"
          >
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
                'w-full break-words px-0.5 text-center text-xs leading-tight text-balance',
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
