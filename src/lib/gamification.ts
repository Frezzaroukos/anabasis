/**
 * Gamification «υψομέτρου» — XP, επίπεδα ως στάδια ανάβασης, badges κορυφών.
 * ΟΛΕΣ οι συναρτήσεις είναι καθαρές (δέχονται τα δεδομένα ως args) ώστε να
 * ελέγχονται χωρίς DB. Καμία τιμή δεν εφευρίσκεται: 0 δραστηριότητα → επίπεδο 1
 * χωρίς badges, όχι ψεύτικη πρόοδος.
 *
 * XP formula (σκόπιμα απλή & ντετερμινιστική):
 *   κάθε ολοκληρωμένη προπόνηση = 100 · κάθε καταγεγραμμένο σετ = 5 ·
 *   κάθε ρεκόρ = 50 · κάθε βήμα skill που κατακτήθηκε = 40.
 * Επίπεδο: τετραγωνική καμπύλη — level = floor(sqrt(xp/100)) + 1, ώστε τα
 * πρώτα επίπεδα να έρχονται γρήγορα και μετά να απαιτούν όλο και περισσότερα.
 */

export interface GamificationInput {
  completedWorkouts: number;
  totalSets: number;
  prCount: number;
  masteredSteps: number;
  masteredSkills: number;
  streakDays: number;
  longestStreakDays: number;
}

export const XP_PER = {
  workout: 100,
  set: 5,
  pr: 50,
  skillStep: 40,
} as const;

export type TierKey = 'baseCamp' | 'ridge' | 'alpine' | 'summit' | 'stratosphere';

export interface Tier {
  key: TierKey;
  /** i18n key για το όνομα */
  nameKey: string;
  /** ενδεικτικό υψόμετρο (flavor) */
  altitudeM: number;
  /** ελάχιστο level για αυτό το tier */
  minLevel: number;
}

/** Στάδια ανάβασης με πραγματικά υψόμετρα ως flavour (Όλυμπος 2918μ, κ.λπ.). */
export const TIERS: Tier[] = [
  { key: 'baseCamp', nameKey: 'gami.tier.baseCamp', altitudeM: 0, minLevel: 1 },
  { key: 'ridge', nameKey: 'gami.tier.ridge', altitudeM: 1200, minLevel: 5 },
  { key: 'alpine', nameKey: 'gami.tier.alpine', altitudeM: 2918, minLevel: 10 },
  { key: 'summit', nameKey: 'gami.tier.summit', altitudeM: 4808, minLevel: 18 },
  { key: 'stratosphere', nameKey: 'gami.tier.stratosphere', altitudeM: 8849, minLevel: 30 },
];

export function totalXp(d: GamificationInput): number {
  return (
    d.completedWorkouts * XP_PER.workout +
    d.totalSets * XP_PER.set +
    d.prCount * XP_PER.pr +
    d.masteredSteps * XP_PER.skillStep
  );
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1;
  return Math.floor(Math.sqrt(xp / 100)) + 1;
}

/** Συνολικό XP που απαιτείται για να ΦΤΑΣΕΙΣ ένα επίπεδο (αντίστροφο του παραπάνω). */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0;
  return (level - 1) * (level - 1) * 100;
}

export function tierForLevel(level: number): Tier {
  let current = TIERS[0]!;
  for (const t of TIERS) if (level >= t.minLevel) current = t;
  return current;
}

export interface LevelProgress {
  level: number;
  tier: Tier;
  xp: number;
  xpIntoLevel: number;
  xpForThisLevel: number;
  xpForNextLevel: number;
  /** 0..1 πρόοδος προς το επόμενο επίπεδο */
  fraction: number;
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  const span = next - floor;
  return {
    level,
    tier: tierForLevel(level),
    xp,
    xpIntoLevel: xp - floor,
    xpForThisLevel: floor,
    xpForNextLevel: next,
    fraction: span > 0 ? Math.min(1, (xp - floor) / span) : 0,
  };
}

export interface BadgeDef {
  id: string;
  nameKey: string;
  descKey: string;
  earned: (d: GamificationInput) => boolean;
}

/** Badges κορυφών — σταθερά, ντετερμινιστικά κατώφλια. */
export const BADGES: BadgeDef[] = [
  {
    id: 'first-ascent',
    nameKey: 'gami.badge.firstAscent.name',
    descKey: 'gami.badge.firstAscent.desc',
    earned: (d) => d.completedWorkouts >= 1,
  },
  {
    id: 'week-streak',
    nameKey: 'gami.badge.weekStreak.name',
    descKey: 'gami.badge.weekStreak.desc',
    earned: (d) => d.longestStreakDays >= 7,
  },
  {
    id: 'ten-sessions',
    nameKey: 'gami.badge.tenSessions.name',
    descKey: 'gami.badge.tenSessions.desc',
    earned: (d) => d.completedWorkouts >= 10,
  },
  {
    id: 'record-breaker',
    nameKey: 'gami.badge.recordBreaker.name',
    descKey: 'gami.badge.recordBreaker.desc',
    earned: (d) => d.prCount >= 10,
  },
  {
    id: 'first-skill',
    nameKey: 'gami.badge.firstSkill.name',
    descKey: 'gami.badge.firstSkill.desc',
    earned: (d) => d.masteredSkills >= 1,
  },
  {
    id: 'century',
    nameKey: 'gami.badge.century.name',
    descKey: 'gami.badge.century.desc',
    earned: (d) => d.completedWorkouts >= 100,
  },
  {
    id: 'month-streak',
    nameKey: 'gami.badge.monthStreak.name',
    descKey: 'gami.badge.monthStreak.desc',
    earned: (d) => d.longestStreakDays >= 30,
  },
];

export interface BadgeState extends BadgeDef {
  isEarned: boolean;
}

export function badgeStates(d: GamificationInput): BadgeState[] {
  return BADGES.map((b) => ({ ...b, isEarned: b.earned(d) }));
}

export interface XpBreakdownRow {
  labelKey: string;
  count: number;
  xp: number;
}

export function xpBreakdown(d: GamificationInput): XpBreakdownRow[] {
  return [
    { labelKey: 'gami.xp.workouts', count: d.completedWorkouts, xp: d.completedWorkouts * XP_PER.workout },
    { labelKey: 'gami.xp.sets', count: d.totalSets, xp: d.totalSets * XP_PER.set },
    { labelKey: 'gami.xp.prs', count: d.prCount, xp: d.prCount * XP_PER.pr },
    { labelKey: 'gami.xp.skillSteps', count: d.masteredSteps, xp: d.masteredSteps * XP_PER.skillStep },
  ].filter((r) => r.count > 0);
}

/** Έχει ο χρήστης καμία δραστηριότητα; (κρύβει την κάρτα σε φρέσκο προφίλ) */
export function hasActivity(d: GamificationInput): boolean {
  return d.completedWorkouts > 0;
}
