import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Plus } from 'lucide-react';
import {
  getAllSkillProgress,
  getSkillStepStats,
  listSkills,
  setSkillArchived,
} from '@/lib/db/queries';
import { BUILTIN_SKILL_CATEGORIES } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { SkillCreateForm } from './components/SkillCreateForm';
import { SkillRow } from './components/SkillRow';

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
  // Scoped query: τα raw db.* reads εδώ έδειχναν τα done-counts ΟΛΩΝ των
  // προφίλ μπλεγμένα — δύο προφίλ στο ίδιο seeded skill μοιράζονταν πρόοδο.
  const stepStats = useLiveQuery(
    () => getSkillStepStats(),
    [],
    new Map<string, { total: number; done: number }>(),
  );

  const masteredCount = [...progress.values()].filter(
    (p) => p.status === 'mastered',
  ).length;

  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  // Προτάσεις κατηγορίας: οι 5 builtin + ό,τι δικές σου κατηγορίες υπάρχουν ήδη.
  const categorySuggestions = useMemo(() => {
    const set = new Set<string>(BUILTIN_SKILL_CATEGORIES);
    for (const s of skills) set.add(s.category);
    return [...set];
  }, [skills]);

  const visibleSkills = skills.filter((s) => showArchived || !s.is_archived);
  const archivedCount = skills.filter((s) => s.is_archived).length;

  return (
    <div className="space-y-6">
      <header className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">
            {t('skills.title')}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {visibleSkills.length} {t('skills.available')}
            {masteredCount > 0 && (
              <>
                {' · '}
                <span className="text-gold">{masteredCount} ★</span>
              </>
            )}
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
        <SkillCreateForm
          categorySuggestions={categorySuggestions}
          onCreated={(s) => {
            setCreating(false);
            // Ευθεία στο skill — το επόμενο βήμα είναι πάντα να προσθέσεις steps.
            navigate(`/skills/${s.id}`);
          }}
          onCancel={() => setCreating(false)}
        />
      )}

      {visibleSkills.length === 0 && !creating ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-8 text-center">
          <Logo className="h-10 w-10 text-primary" />
          <p className="text-sm font-medium">{t('skills.emptyTitle', 'No skills yet')}</p>
          <p className="max-w-xs text-xs text-muted-foreground">
            {t('skills.emptyHint', 'Add your first skill to start climbing the ladder.')}
          </p>
        </div>
      ) : (
        <ul className="stagger divide-y divide-border/60 overflow-hidden rounded-xl bg-card">
          {visibleSkills.map((s) => (
            <SkillRow
              key={s.id}
              skill={s}
              mastered={progress.get(s.id)?.status === 'mastered'}
              total={stepStats.get(s.id)?.total ?? 0}
              done={stepStats.get(s.id)?.done ?? 0}
              onToggleArchive={() => void setSkillArchived(s.id, !s.is_archived)}
            />
          ))}
        </ul>
      )}

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
