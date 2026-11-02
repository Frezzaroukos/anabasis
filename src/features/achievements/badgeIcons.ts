import {
  Award,
  CalendarCheck,
  Dumbbell,
  Flame,
  Gem,
  Medal,
  Mountain,
  Trophy,
  type LucideIcon,
} from 'lucide-react';

export interface BadgeVisual {
  Icon: LucideIcon;
  /** Tinted medallion background + icon color. */
  tone: string;
}

export const BADGE_VISUALS: Record<string, BadgeVisual> = {
  'first-ascent': { Icon: Mountain, tone: 'bg-primary/10 text-primary' },
  'week-streak': { Icon: CalendarCheck, tone: 'bg-category-pull/12 text-category-pull' },
  'ten-sessions': { Icon: Dumbbell, tone: 'bg-category-push/12 text-category-push' },
  'record-breaker': { Icon: Trophy, tone: 'bg-gold/10 text-gold' },
  'first-skill': { Icon: Medal, tone: 'bg-category-legs/12 text-category-legs' },
  century: { Icon: Gem, tone: 'bg-category-mixed/12 text-category-mixed' },
  'month-streak': { Icon: Flame, tone: 'bg-category-core/12 text-category-core' },
};

export const FALLBACK_BADGE_VISUAL: BadgeVisual = {
  Icon: Award,
  tone: 'bg-elevated text-muted-foreground',
};
