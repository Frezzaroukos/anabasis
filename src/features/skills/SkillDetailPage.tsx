import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  achieveStep,
  getSkillWithSteps,
  getStepCompletions,
  getSkillProgress,
  undoStep,
} from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Η «σκάλα» ενός skill — το moat του Anabasis.
 * Κάθε βήμα δείχνει στόχο (hold/reps), αν έχει κατακτηθεί, και επιτρέπει
 * καταγραφή της επίδοσης. Τα κλειδωμένα βήματα φαίνονται, αλλά υποτονισμένα:
 * ο αθλητής πρέπει να βλέπει πού πάει, όχι μόνο πού είναι.
 */
export function SkillDetailPage() {
  const { t } = useTranslation();
  const { skillId = '' } = useParams();
  const [draft, setDraft] = useState<Record<string, string>>({});

  const data = useLiveQuery(() => getSkillWithSteps(skillId), [skillId]);
  const steps = data?.steps ?? [];
  const completions = useLiveQuery(
    () => getStepCompletions(steps.map((s) => s.id)),
    [steps.map((s) => s.id).join(',')],
    new Map(),
  );
  const progress = useLiveQuery(() => getSkillProgress(skillId), [skillId]);

  if (!data) {
    return <p className="text-sm text-muted-foreground">{t('common.loading')}</p>;
  }

  const { skill } = data;
  const doneCount = steps.filter((s) => completions.has(s.id)).length;
  const pct = steps.length ? Math.round((doneCount / steps.length) * 100) : 0;
  // Πρώτο μη-ολοκληρωμένο = το τρέχον· ό,τι έπεται είναι κλειδωμένο.
  const currentIdx = steps.findIndex((s) => !completions.has(s.id));

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          to="/skills"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {t('skills.title')}
        </Link>
        <div className="flex items-baseline justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{skill.name}</h1>
          <span className="font-mono text-xs text-muted-foreground">
            {skill.short_code}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{skill.description}</p>
        <p className="text-sm">
          <span className="text-muted-foreground">{t('skills.goal')}: </span>
          {skill.ultimate_goal}
        </p>

        <div className="pt-2">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span>
              {doneCount}/{steps.length} {t('skills.stepsDone')}
            </span>
            <span>{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress?.status === 'mastered' ? 'bg-emerald-500' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress?.status === 'mastered' && (
            <p className="mt-2 text-sm font-medium text-emerald-500">
              ★ {t('skills.mastered')}
            </p>
          )}
        </div>
      </header>

      <ol className="space-y-3">
        {steps.map((step, i) => {
          const done = completions.get(step.id);
          const isCurrent = i === currentIdx;
          const locked = currentIdx !== -1 && i > currentIdx;

          return (
            <li
              key={step.id}
              className={cn(
                'rounded-lg border p-4 transition-colors',
                done && 'border-emerald-500/40 bg-emerald-500/5',
                isCurrent && 'border-primary bg-card',
                locked && 'border-border bg-card/50 opacity-60',
                !done && !isCurrent && !locked && 'border-border bg-card',
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                    done
                      ? 'bg-emerald-500 text-white'
                      : isCurrent
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? '✓' : step.step_number}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{step.name}</p>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                  <p className="mt-1 font-mono text-xs">
                    {t('skills.target')}: {step.target_value} {step.target_unit}
                  </p>

                  {done && (
                    <p className="mt-2 text-xs text-emerald-500">
                      {t('skills.achieved')}: {done.achieved_value} {step.target_unit}
                      {' · '}
                      {new Date(done.achieved_at).toLocaleDateString()}
                    </p>
                  )}

                  {isCurrent && (
                    <div className="mt-3 flex gap-2">
                      <Input
                        type="number"
                        inputMode="decimal"
                        className="h-9 w-24"
                        placeholder={String(step.target_value)}
                        value={draft[step.id] ?? ''}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [step.id]: e.target.value }))
                        }
                        aria-label={t('skills.achieved')}
                      />
                      <Button
                        className="h-9"
                        onClick={() => {
                          const v = Number(draft[step.id] ?? step.target_value);
                          void achieveStep(
                            skillId,
                            step.id,
                            Number.isFinite(v) ? v : step.target_value,
                          );
                          setDraft((d) => ({ ...d, [step.id]: '' }));
                        }}
                      >
                        {t('skills.markAchieved')}
                      </Button>
                    </div>
                  )}

                  {done && (
                    <button
                      type="button"
                      className="mt-2 text-xs text-muted-foreground underline-offset-2 hover:underline"
                      onClick={() => void undoStep(skillId, step.id)}
                    >
                      {t('common.undo')}
                    </button>
                  )}

                  {step.benchmark_video_url && (
                    <a
                      href={step.benchmark_video_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block text-xs text-primary underline-offset-2 hover:underline"
                    >
                      {t('skills.watchBenchmark')}
                    </a>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
