import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { getAllSkillProgress } from '@/lib/db/queries';
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
  const progress = useLiveQuery(() => getAllSkillProgress(), [], new Map());
  // Πρόοδος ανά skill στη λίστα, ώστε να τη βλέπεις χωρίς να ανοίξεις το skill.
  const stepCounts = useLiveQuery(
    async () => {
      const all = await db.skill_steps.toArray();
      const m = new Map<string, number>();
      for (const s of all) m.set(s.skill_id, (m.get(s.skill_id) ?? 0) + 1);
      return m;
    },
    [],
    new Map<string, number>(),
  );
  const doneCounts = useLiveQuery(
    async () => {
      const [steps, done] = await Promise.all([
        db.skill_steps.toArray(),
        db.user_skill_step_completions.toArray(),
      ]);
      const stepToSkill = new Map(steps.map((s) => [s.id, s.skill_id]));
      const m = new Map<string, number>();
      for (const c of done) {
        const sid = stepToSkill.get(c.skill_step_id);
        if (sid) m.set(sid, (m.get(sid) ?? 0) + 1);
      }
      return m;
    },
    [],
    new Map<string, number>(),
  );

  const masteredCount = [...progress.values()].filter(
    (p) => p.status === 'mastered',
  ).length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('skills.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {skills.length} {t('skills.available')}
          {masteredCount > 0 && ` · ${masteredCount} ★`}
        </p>
      </header>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {skills.map((s) => {
          const total = stepCounts.get(s.id) ?? 0;
          const done = doneCounts.get(s.id) ?? 0;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const mastered = progress.get(s.id)?.status === 'mastered';

          return (
            <li key={s.id}>
              <Link
                to={`/skills/${s.id}`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/50"
              >
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    CATEGORY_DOT[s.category],
                  )}
                  aria-hidden
                />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    {s.name}
                    {mastered && <span className="text-emerald-500">★</span>}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {s.ultimate_goal}
                  </p>
                  {total > 0 && (
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1 w-24 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            mastered ? 'bg-emerald-500' : 'bg-primary',
                          )}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {done}/{total}
                      </span>
                    </div>
                  )}
                </div>
                <span className="font-mono text-xs text-muted-foreground">
                  {s.short_code}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
