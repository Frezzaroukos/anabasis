import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Archive, ArchiveRestore, Pencil, Plus, Search, Sparkles } from 'lucide-react';
import {
  getAllSkillProgress,
  getExerciseSummaries,
  getSkillStepStats,
  listAllExercises,
  listExerciseCategories,
  listSkills,
  setExerciseArchived,
  setSkillArchived,
} from '@/lib/db/queries';
import type { Exercise } from '@/lib/db/types';
import { BUILTIN_SKILL_CATEGORIES } from '@/lib/db/types';
import { getCurrentUserId } from '@/lib/db/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkillCreateForm } from '@/features/skills/components/SkillCreateForm';
import { SkillRow } from '@/features/skills/components/SkillRow';
import { ExerciseFormSheet } from './components/ExerciseFormSheet';
import {
  categoryDotClass,
  groupLibraryByCategory,
  matchesLibraryFilter,
  normalizeSkillCategory,
} from './utils';
import type { LibraryFilter } from './utils';
import { cn } from '@/lib/utils';

/**
 * Η βιβλιοθήκη ασκήσεων — ενοποιημένη με τα skills (οργανωτικό merge,
 * ARCHITECTURE-V4 §4). Ίδια section ανά κατηγορία, ίδια αναζήτηση/φίλτρα·
 * το skill ξεχωρίζει οπτικά (SkillIcon + rung stack) αντί για extra badge.
 * Tap άσκηση → η πρόοδός της (chart)· tap skill → η σκάλα του.
 */
export function ExercisesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const allExercises = useLiveQuery(() => listAllExercises(), [], []);
  const exerciseCategories = useLiveQuery(() => listExerciseCategories(), [], []);
  const summaries = useLiveQuery(
    () => getExerciseSummaries(),
    [],
    new Map<string, { lastTrainedAt: string | null; hasPR: boolean }>(),
  );
  const skills = useLiveQuery(() => listSkills(true), [], []);
  const skillProgress = useLiveQuery(() => getAllSkillProgress(), [], new Map());
  const stepStats = useLiveQuery(
    () => getSkillStepStats(),
    [],
    new Map<string, { total: number; done: number }>(),
  );

  const [filter, setFilter] = useState<LibraryFilter>('all');
  const [query, setQuery] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState<Exercise | undefined>(undefined);
  const [creatingSkill, setCreatingSkill] = useState(false);

  const currentUserId = getCurrentUserId();
  const q = query.trim().toLowerCase();

  const filteredExercises = useMemo(
    () =>
      allExercises.filter(
        (ex) =>
          matchesLibraryFilter(ex, filter, currentUserId) &&
          (q === '' || ex.name.toLowerCase().includes(q)),
      ),
    [allExercises, filter, q, currentUserId],
  );
  const filteredSkills = useMemo(
    () =>
      skills.filter(
        (s) =>
          matchesLibraryFilter(s, filter, currentUserId) &&
          (q === '' || s.name.toLowerCase().includes(q)),
      ),
    [skills, filter, q, currentUserId],
  );

  // Union: builtin categories + οποιαδήποτε δική σου (exercise ή normalized skill).
  const categories = useMemo(() => {
    const set = new Set(exerciseCategories);
    for (const s of skills) set.add(normalizeSkillCategory(s.category));
    return [...set].sort();
  }, [exerciseCategories, skills]);

  const groups = useMemo(
    () => groupLibraryByCategory(filteredExercises, filteredSkills, categories),
    [filteredExercises, filteredSkills, categories],
  );

  const skillCategorySuggestions = useMemo(() => {
    const set = new Set<string>(BUILTIN_SKILL_CATEGORIES);
    for (const s of skills) set.add(s.category);
    return [...set];
  }, [skills]);

  const activeCount =
    allExercises.filter((e) => !e.is_archived).length + skills.filter((s) => !s.is_archived).length;
  const masteredCount = [...skillProgress.values()].filter((p) => p.status === 'mastered').length;

  const openCreate = () => {
    setEditingExercise(undefined);
    setFormOpen(true);
  };

  const openEdit = (ex: Exercise) => {
    setEditingExercise(ex);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('exercises.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {activeCount} {t('exercises.available')}
            {masteredCount > 0 && (
              <>
                {' · '}
                <span className="text-gold">{masteredCount} ★</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setCreatingSkill(true)}>
            <Sparkles className="h-4 w-4" />
            {t('skills.newSkill')}
          </Button>
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4" />
            {t('exercises.new')}
          </Button>
        </div>
      </header>

      {creatingSkill && (
        <SkillCreateForm
          categorySuggestions={skillCategorySuggestions}
          onCreated={(s) => {
            setCreatingSkill(false);
            // Ευθεία στη σκάλα — το επόμενο βήμα είναι πάντα να προσθέσεις steps.
            navigate(`/skills/${s.id}`);
          }}
          onCancel={() => setCreatingSkill(false)}
        />
      )}

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('exercises.search')}
          className="pl-9"
          aria-label={t('exercises.search')}
        />
      </div>

      <div className="flex gap-2">
        {(['all', 'mine', 'archived'] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={cn(
              'rounded-md border border-border px-3 py-1.5 text-sm transition-colors',
              filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
            )}
          >
            {t(`exercises.filter.${f}`)}
          </button>
        ))}
      </div>

      {groups.length === 0 ? (
        <p className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
          {filter === 'archived' ? t('exercises.emptyArchived') : t('exercises.empty')}
        </p>
      ) : (
        <div className="space-y-2">
          {groups.map(({ category, items }) => (
            <section key={category}>
              <h3 className="px-1 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {category}
              </h3>
              <ul className="divide-y divide-border/60 rounded-lg bg-card">
                {items.map((item) =>
                  item.kind === 'skill' ? (
                    <SkillRow
                      key={`skill-${item.skill.id}`}
                      skill={item.skill}
                      mastered={skillProgress.get(item.skill.id)?.status === 'mastered'}
                      total={stepStats.get(item.skill.id)?.total ?? 0}
                      done={stepStats.get(item.skill.id)?.done ?? 0}
                      onToggleArchive={() =>
                        void setSkillArchived(item.skill.id, !item.skill.is_archived)
                      }
                    />
                  ) : (
                    <ExerciseRow
                      key={`exercise-${item.exercise.id}`}
                      exercise={item.exercise}
                      summary={summaries.get(item.exercise.id)}
                      onOpen={() => navigate(`/exercises/${item.exercise.id}`)}
                      onEdit={() => openEdit(item.exercise)}
                    />
                  ),
                )}
              </ul>
            </section>
          ))}
        </div>
      )}

      <ExerciseFormSheet
        open={formOpen}
        onClose={() => setFormOpen(false)}
        exercise={editingExercise}
        categorySuggestions={exerciseCategories}
      />
    </div>
  );
}

interface ExerciseRowProps {
  exercise: Exercise;
  summary: { lastTrainedAt: string | null; hasPR: boolean } | undefined;
  onOpen: () => void;
  onEdit: () => void;
}

/**
 * Η γραμμή πλέον ανοίγει την πρόοδο (chart) στο tap — η επεξεργασία μετακόμισε
 * σε ξεχωριστό pencil, ίδιο μοτίβο με το skill archive-icon δίπλα στο row link.
 */
function ExerciseRow({ exercise, summary, onOpen, onEdit }: ExerciseRowProps) {
  const { t } = useTranslation();

  return (
    <li className={cn('flex items-center gap-3 px-4 py-3 transition-colors hover:bg-elevated', exercise.is_archived && 'opacity-60')}>
      <span className={cn('h-2 w-2 shrink-0 rounded-full', categoryDotClass(exercise.category))} aria-hidden />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
        <p className="flex items-center gap-2 text-sm font-medium">
          {summary?.hasPR && (
            <span className="shrink-0 text-gold" aria-hidden title="PR">★</span>
          )}
          {exercise.name}
          {exercise.user_id === null ? (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase text-muted-foreground">
              {t('exercises.builtin')}
            </span>
          ) : (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] uppercase text-primary">
              {t('exercises.custom')}
            </span>
          )}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {t(`exercises.movementType.${exercise.movement_type}`)}
          {exercise.equipment.length > 0 && ` · ${exercise.equipment.join(', ')}`}
        </p>
      </button>
      <button
        type="button"
        onClick={onEdit}
        aria-label={t('exercises.editTitle')}
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Pencil className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => void setExerciseArchived(exercise.id, !exercise.is_archived)}
        aria-label={t(exercise.is_archived ? 'exercises.unarchive' : 'exercises.archive')}
        className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        {exercise.is_archived ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}
      </button>
    </li>
  );
}
