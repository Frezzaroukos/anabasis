import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createSkill } from '@/lib/db/queries';
import type { Skill } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

const DIFFICULTIES: Skill['difficulty'][] = [1, 2, 3, 4, 5];

interface SkillCreateFormProps {
  categorySuggestions: string[];
  onCreated: (skill: Skill) => void;
  onCancel: () => void;
}

/**
 * Φόρμα δημιουργίας skill — αποσπασμένη ώστε το ΙΔΙΟ workflow να δουλεύει και
 * από το SkillsPage και από το ενοποιημένο Exercises (οργανωτικό merge, βλ.
 * ARCHITECTURE-V4 §4): ένα σημείο αλήθειας, όχι δύο φόρμες που ξεσυγχρονίζονται.
 */
export function SkillCreateForm({ categorySuggestions, onCreated, onCancel }: SkillCreateFormProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [difficulty, setDifficulty] = useState<Skill['difficulty']>(3);
  const [description, setDescription] = useState('');
  const [ultimateGoal, setUltimateGoal] = useState('');
  const [busy, setBusy] = useState(false);

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
      onCreated(s);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="animate-rise-in space-y-3 rounded-lg bg-elevated p-4">
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
                'rounded-md px-2.5 py-1 text-xs transition-colors',
                category === c
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
                'h-9 w-9 rounded-md text-sm transition-colors',
                difficulty === d
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground',
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
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
      </div>
    </section>
  );
}
