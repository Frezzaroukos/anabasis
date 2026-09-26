/**
 * NextMovesCard — the main Coach mode panel on Home.
 *
 * Renders planNextPeriod output: goal-linked moves first, then general.
 * Gated on coach_enabled setting.
 */

import { useTranslation } from 'react-i18next';
import { Compass } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCoachData } from './useCoachData';
import type { NextMove } from '@/lib/domain/coach';

export function NextMovesCard() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const enabled = !!settings?.coach_enabled;

  // Hook ΠΑΝΤΑ (rules-of-hooks)· ο ίδιος ο hook δεν τρέχει queries όταν off.
  const { moves, loading } = useCoachData(enabled);

  // Gate on setting — μετά τα hooks.
  if (!enabled) {
    return null;
  }

  // Render loading state
  if (loading) {
    return (
      <div className="space-y-4 rounded-lg border border-border/50 bg-card p-4">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">{t('coach.nextMoves')}</h2>
        </div>
        <div className="space-y-2">
          {[1, 2].map((i) => (
            <div key={i} className="h-8 animate-pulse rounded bg-muted/40" />
          ))}
        </div>
      </div>
    );
  }

  // Render empty state
  if (moves.length === 0) {
    return (
      <div className="space-y-4 rounded-lg border border-border/50 bg-card p-4">
        <div className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold text-foreground">{t('coach.nextMoves')}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{t('coach.nextMovesEmpty')}</p>
      </div>
    );
  }

  // Separate goal-linked from general
  const goalMoves = moves.filter((m) => m.reason === 'goal');
  const generalMoves = moves.filter((m) => m.reason === 'general');

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-card p-4">
      <div className="flex items-center gap-2">
        <Compass className="h-5 w-5 text-primary" />
        <h2 className="font-semibold text-foreground">{t('coach.nextMoves')}</h2>
      </div>

      <div className="space-y-3">
        {/* Goal-linked moves */}
        {goalMoves.map((move) => (
          <MoveRow key={move.exerciseId} move={move} isGoalLinked={true} />
        ))}

        {/* General moves */}
        {generalMoves.length > 0 && goalMoves.length > 0 && (
          <div className="my-2 border-t border-border/40" />
        )}
        {generalMoves.map((move) => (
          <MoveRow key={move.exerciseId} move={move} isGoalLinked={false} />
        ))}
      </div>
    </div>
  );
}

function MoveRow({ move, isGoalLinked }: { move: NextMove; isGoalLinked: boolean }) {
  const { t } = useTranslation();

  return (
    <div className="text-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-semibold text-foreground">{move.exerciseName}</span>
        {isGoalLinked && move.goalLabel && (
          <span className="text-xs text-muted-foreground">
            {t('coach.goalLinked', { label: move.goalLabel })}
          </span>
        )}
      </div>
      <div className="mt-0.5 text-xs text-muted-foreground">→ {move.move}</div>
    </div>
  );
}
