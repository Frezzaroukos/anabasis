import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore, Trophy } from 'lucide-react';
import type { Skill } from '@/lib/db/types';
import { SkillIcon } from '@/components/SkillIcon';
import { CategoryBadge } from '@/components/CategoryBadge';
import { RungStack } from './RungStack';
import { cn } from '@/lib/utils';

interface SkillRowProps {
  skill: Skill;
  mastered: boolean;
  total: number;
  done: number;
  onToggleArchive: () => void;
}

/**
 * Μία γραμμή skill — κοινή ανάμεσα στο SkillsPage και στην ενοποιημένη
 * βιβλιοθήκη (Exercises, βλ. ARCHITECTURE-V4 §4). `user_id === null` = seeded
 * (ίδια σύμβαση με τα exercises), δεν χρειάζεται ξεχωριστό builtin-set.
 */
export function SkillRow({ skill, mastered, total, done, onToggleArchive }: SkillRowProps) {
  const { t } = useTranslation();
  const isBuiltin = skill.user_id === null;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <li className={cn(skill.is_archived && 'opacity-50')}>
      <div className="flex min-h-[3.5rem] items-center gap-1 py-2.5 pl-4 pr-1.5 transition-colors hover:bg-elevated">
        <Link
          to={`/skills/${skill.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <SkillIcon skill={skill.short_code} className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-center gap-2 text-sm font-medium">
              <span className="truncate">{skill.name}</span>
              {mastered && <Trophy className="h-3.5 w-3.5 shrink-0 text-gold" aria-hidden />}
              <CategoryBadge category={skill.category} />
              {!isBuiltin && (
                <span className="shrink-0 rounded-full bg-primary/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide text-primary">
                  {t('skills.custom')}
                </span>
              )}
            </p>
            <p className="truncate text-xs text-muted-foreground">{skill.ultimate_goal}</p>
          </div>
          {/* Η πρόοδος δεξιά, σε σταθερή στήλη — σκανάρεις τη λίστα κάθετα και
              βλέπεις πού είσαι σε κάθε skill χωρίς να διαβάζεις. */}
          {total > 0 && (
            <div className="flex shrink-0 items-center gap-2">
              <RungStack pct={pct / 100} mastered={mastered} />
              <span className="w-8 text-right font-mono text-xs tabular-nums text-muted-foreground">
                {done}/{total}
              </span>
            </div>
          )}
        </Link>
        <button
          type="button"
          onClick={onToggleArchive}
          aria-label={skill.is_archived ? t('skills.restore') : t('skills.archive')}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-accent hover:text-accent-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {skill.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}
