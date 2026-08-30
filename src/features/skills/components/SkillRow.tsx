import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Archive, ArchiveRestore } from 'lucide-react';
import type { Skill, SkillCategory } from '@/lib/db/types';
import { SkillIcon } from '@/components/SkillIcon';
import { RungStack } from './RungStack';
import { cn } from '@/lib/utils';

const CATEGORY_DOT: Record<SkillCategory, string> = {
  push: 'bg-category-push',
  pull: 'bg-category-pull',
  lower: 'bg-category-legs',
  core: 'bg-category-core',
  mixed: 'bg-category-mixed',
};

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
      <div className="flex items-center gap-2 px-4 py-3">
        <Link
          to={`/skills/${skill.id}`}
          className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:opacity-80"
        >
          <span
            className={cn('h-2 w-2 shrink-0 rounded-full', CATEGORY_DOT[skill.category] ?? 'bg-zinc-400')}
            aria-hidden
          />
          <SkillIcon skill={skill.short_code} className="h-5 w-5 shrink-0 text-primary" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-sm font-medium">
              {skill.name}
              {mastered && <span className="text-gold">★</span>}
              <span
                className={cn(
                  'rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
                  isBuiltin ? 'bg-muted text-muted-foreground' : 'bg-primary/15 text-primary',
                )}
              >
                {isBuiltin ? t('skills.builtin') : t('skills.custom')}
              </span>
            </p>
            <p className="truncate text-xs text-muted-foreground">{skill.ultimate_goal}</p>
            {total > 0 && (
              <div className="mt-2 flex items-center gap-2">
                <RungStack pct={pct / 100} mastered={mastered} />
                <span className="font-mono text-[10px] text-muted-foreground">
                  {done}/{total}
                </span>
              </div>
            )}
          </div>
          <span className="font-mono text-xs text-muted-foreground">{skill.short_code}</span>
        </Link>
        <button
          type="button"
          onClick={onToggleArchive}
          aria-label={skill.is_archived ? t('skills.restore') : t('skills.archive')}
          className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        >
          {skill.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
        </button>
      </div>
    </li>
  );
}
