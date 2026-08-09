import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { getAllSkillProgress, listSkills } from '@/lib/db/queries';
import { SectionTitle } from '@/components/ui/Section';
import { cn } from '@/lib/utils';

/**
 * Πόσο μακριά έχεις φτάσει σε ΟΛΑ τα skills.
 *
 * Ήταν δύο ξερά νούμερα («σε εξέλιξη 1 / κατακτημένα 0») — σωστά αλλά χωρίς
 * αίσθηση κλίμακας: δεν έλεγαν πόσα υπάρχουν συνολικά ούτε πόσο δρόμο έχεις
 * κάνει. Τώρα μια μπάρα δείχνει τη θέση σου μέσα στο σύνολο, με τα
 * κατακτημένα σε χρυσό (= επίτευγμα) και τα εν εξελίξει στο accent.
 */
export function SkillsProgressCard() {
  const { t } = useTranslation();
  const progress = useLiveQuery(() => getAllSkillProgress(), [], new Map());
  const skills = useLiveQuery(() => listSkills(), [], []);

  let inProgress = 0;
  let mastered = 0;
  for (const p of progress.values()) {
    if (p.status === 'in_progress') inProgress += 1;
    if (p.status === 'mastered') mastered += 1;
  }
  if (inProgress + mastered === 0) return null;

  const total = Math.max(skills.length, inProgress + mastered);
  const pct = (n: number) => `${(n / total) * 100}%`;

  return (
    <Link
      to="/skills"
      className="block rounded-xl border border-border/70 bg-card p-4 transition-colors hover:border-primary/40"
    >
      <SectionTitle
        action={
          <span className="font-mono text-xs text-muted-foreground">
            {mastered + inProgress}/{total}
          </span>
        }
      >
        {t('dashboard.skillsProgress')}
      </SectionTitle>

      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        <span
          className="bg-[hsl(var(--gold))] transition-[width] duration-500"
          style={{ width: pct(mastered) }}
        />
        <span
          className="bg-primary transition-[width] duration-500"
          style={{ width: pct(inProgress) }}
        />
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-xs">
        <Legend dotClass="bg-[hsl(var(--gold))]" label={t('skills.mastered')} value={mastered} />
        <Legend dotClass="bg-primary" label={t('skills.inProgress')} value={inProgress} />
        <Legend
          dotClass="bg-muted"
          label={t('skills.locked')}
          value={Math.max(0, total - mastered - inProgress)}
        />
      </dl>
    </Link>
  );
}

function Legend({
  dotClass,
  label,
  value,
}: {
  dotClass: string;
  label: string;
  value: number;
}) {
  return (
    <span className="flex items-center gap-1.5">
      <span aria-hidden className={cn('h-2 w-2 rounded-full', dotClass)} />
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-mono text-foreground">{value}</dd>
    </span>
  );
}
