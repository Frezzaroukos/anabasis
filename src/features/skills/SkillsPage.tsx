import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import type { SkillCategory } from '@/lib/db/types';
import { cn } from '@/lib/utils';

const CATEGORY_DOT: Record<SkillCategory, string> = {
  push: 'bg-category-push',
  pull: 'bg-category-pull',
  lower: 'bg-category-legs',
  core: 'bg-category-core',
  mixed: 'bg-category-mixed',
};

export function SkillsPage() {
  const { t } = useTranslation();
  const skills = useLiveQuery(
    () => db.skills.orderBy('display_order').toArray(),
    [],
    [],
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('skills.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {skills.length} progressions available
        </p>
      </header>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {skills.map((s) => (
          <li key={s.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className={cn(
                'h-2 w-2 shrink-0 rounded-full',
                CATEGORY_DOT[s.category],
              )}
              aria-hidden
            />
            <div className="flex-1">
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {s.ultimate_goal}
              </p>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {s.short_code}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
