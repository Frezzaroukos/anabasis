import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Plus } from 'lucide-react';
import { db } from '@/lib/db';
import {
  createSkill,
  getAllSkillProgress,
  listSkills,
  setSkillArchived,
} from '@/lib/db/queries';
import { SEED_SKILLS } from '@/lib/db/seeds';
import { BUILTIN_SKILL_CATEGORIES } from '@/lib/db/types';
import type { Skill, SkillCategory } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkillIcon } from '@/components/SkillIcon';
import { cn } from '@/lib/utils';

const CATEGORY_DOT: Record<SkillCategory, string> = {
  push: 'bg-category-push',
  pull: 'bg-category-pull',
  lower: 'bg-category-legs',
  core: 'bg-category-core',
  mixed: 'bg-category-mixed',
};

// Σταθερά ids των 8 seeded skills — έτσι ξεχωρίζουμε builtin από δικά σου
// χωρίς να χρειάζεται ξεχωριστό πεδίο στο schema.
const BUILTIN_SKILL_IDS = new Set(SEED_SKILLS.map((s) => s.id));

const DIFFICULTIES: Skill['difficulty'][] = [1, 2, 3, 4, 5];

export function SkillsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const skills = useLiveQuery(
    () => listSkills(true),
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

  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState<Skill['difficulty']>(3);
  const [description, setDescription] = useState('');
  const [ultimateGoal, setUltimateGoal] = useState('');
  const [busy, setBusy] = useState(false);

  // Προτάσεις κατηγορίας: οι 5 builtin + ό,τι δικές σου κατηγορίες υπάρχουν ήδη.
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>(BUILTIN_SKILL_CATEGORIES);
    for (const s of skills) set.add(s.category);
    return [...set];
  }, [skills]);

  const visibleSkills = skills.filter((s) => showArchived || !s.is_archived);
  const archivedCount = skills.filter((s) => s.is_archived).length;

  const resetForm = () => {
    setCreating(false);
    setName('');
    setCategory('');
    setDifficulty(3);
    setDescription('');
    setUltimateGoal('');
  };

  const onCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      const s = await createSkill({
        name: trimmed,
        category: category.trim() || undefined,
        difficulty,
        description: description.trim() || undefined,
        ultimate_goal: ultimateGoal.trim() || undefined,
      });
      resetForm();
      // Ευθεία στο skill — το επόμενο βήμα είναι πάντα να προσθέσεις steps.
      navigate(`/skills/${s.id}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {t('skills.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visibleSkills.length} {t('skills.available')}
            {masteredCount > 0 && ` · ${masteredCount} ★`}
          </p>
        </div>
        {!creating && (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            {t('skills.newSkill')}
          </Button>
        )}
      </header>

      {creating && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('skills.namePlaceholder')}
            aria-label={t('skills.namePlaceholder')}
          />

          <div className="space-y-1.5">
            <Input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder={t('skills.categoryPlaceholder')}
              aria-label={t('skills.categoryPlaceholder')}
            />
            <div className="flex flex-wrap gap-2">
              {categorySuggestions.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCategory(c)}
                  className={cn(
                    'rounded-md border border-border px-2.5 py-1 text-xs transition-colors',
                    category === c
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <p className="text-xs text-muted-foreground">{t('skills.difficulty')}</p>
            <div className="flex gap-2">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDifficulty(d)}
                  className={cn(
                    'h-9 w-9 rounded-md border border-border text-sm transition-colors',
                    difficulty === d
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent',
                  )}
                >
                  {d}
                </button>
              ))}
            </div>
          </div>

          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t('skills.descriptionPlaceholder')}
            aria-label={t('skills.descriptionPlaceholder')}
          />
          <Input
            value={ultimateGoal}
            onChange={(e) => setUltimateGoal(e.target.value)}
            placeholder={t('skills.goalPlaceholder')}
            aria-label={t('skills.goalPlaceholder')}
          />

          <div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={!name.trim() || busy} onClick={() => void onCreate()}>
              {t('common.save')}
            </Button>
            <Button size="sm" variant="ghost" onClick={resetForm}>
              {t('common.cancel')}
            </Button>
          </div>
        </section>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {visibleSkills.map((s) => {
          const total = stepCounts.get(s.id) ?? 0;
          const done = doneCounts.get(s.id) ?? 0;
          const pct = total ? Math.round((done / total) * 100) : 0;
          const mastered = progress.get(s.id)?.status === 'mastered';
          const isBuiltin = BUILTIN_SKILL_IDS.has(s.id);

          return (
            <li key={s.id} className={cn(s.is_archived && 'opacity-50')}>
              <div className="flex items-center gap-2 px-4 py-3">
                <Link
                  to={`/skills/${s.id}`}
                  className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:opacity-80"
                >
                  <span
                    className={cn(
                      'h-2 w-2 shrink-0 rounded-full',
                      CATEGORY_DOT[s.category] ?? 'bg-zinc-400',
                    )}
                    aria-hidden
                  />
                  <SkillIcon
                    skill={s.short_code}
                    className="h-5 w-5 shrink-0 text-primary"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      {s.name}
                      {mastered && <span className="text-emerald-500">★</span>}
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wide',
                          isBuiltin
                            ? 'bg-muted text-muted-foreground'
                            : 'bg-primary/15 text-primary',
                        )}
                      >
                        {isBuiltin ? t('skills.builtin') : t('skills.custom')}
                      </span>
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
                <button
                  type="button"
                  onClick={() => void setSkillArchived(s.id, !s.is_archived)}
                  aria-label={
                    s.is_archived ? t('skills.restore') : t('skills.archive')
                  }
                  className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                >
                  {s.is_archived ? (
                    <ArchiveRestore className="h-4 w-4" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {archivedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowArchived((v) => !v)}
          className="text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          {showArchived
            ? t('skills.hideArchived')
            : `${t('skills.showArchived')} (${archivedCount})`}
        </button>
      )}
    </div>
  );
}
