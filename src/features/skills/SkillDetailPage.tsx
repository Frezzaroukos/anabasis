import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  achieveStep,
  addSkillStep,
  getSkillWithSteps,
  getStepCompletions,
  getSkillProgress,
  removeSkillStep,
  undoStep,
  updateSkillStep,
} from '@/lib/db/queries';
import type { SkillStep } from '@/lib/db/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SkillIcon } from '@/components/SkillIcon';
import { ConfirmDialog } from '@/components/ui/dialog';
import { StepFormSheet } from './components/StepFormSheet';
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
  const [addingStep, setAddingStep] = useState(false);
  const [editingStep, setEditingStep] = useState<SkillStep | null>(null);
  const [deleteStepId, setDeleteStepId] = useState<string | null>(null);

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
  const stepById = new Map(steps.map((s) => [s.id, s]));
  const unitSuggestions = [...new Set(steps.map((s) => s.target_unit))];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          to="/skills"
          className="text-xs text-muted-foreground hover:text-foreground"
        >
          ← {t('skills.title')}
        </Link>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <SkillIcon skill={skill.short_code} className="h-12 w-12 shrink-0 text-primary" />
            <h1 className="text-2xl font-semibold tracking-tight">{skill.name}</h1>
          </div>
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
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium">{step.name}</p>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        onClick={() => setEditingStep(step)}
                        aria-label={t('skills.editStep')}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setDeleteStepId(step.id)}
                        aria-label={t('skills.deleteStep')}
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">{step.description}</p>
                  <p className="mt-1 font-mono text-xs">
                    {t('skills.target')}: {step.target_value} {step.target_unit}
                  </p>
                  {/* Η αλυσίδα προαπαιτούμενων — γραμμική, ένα βήμα ξεκλειδώνει το επόμενο. */}
                  {step.prerequisites.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {t('skills.requires')}:{' '}
                      {step.prerequisites
                        .map((id) => stepById.get(id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  )}

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

      <Button variant="outline" className="w-full" onClick={() => setAddingStep(true)}>
        <Plus className="h-4 w-4" />
        {t('skills.addStep')}
      </Button>

      <StepFormSheet
        open={addingStep}
        onClose={() => setAddingStep(false)}
        unitSuggestions={unitSuggestions}
        onSubmit={async (input) => {
          await addSkillStep(skillId, input);
        }}
      />
      <StepFormSheet
        open={editingStep != null}
        onClose={() => setEditingStep(null)}
        initial={editingStep ?? undefined}
        unitSuggestions={unitSuggestions}
        onSubmit={(input) => {
          if (!editingStep) return;
          return updateSkillStep(editingStep.id, {
            name: input.name,
            description: input.description ?? '',
            target_type: input.target_type ?? 'hold',
            target_value: input.target_value ?? 0,
            target_unit: input.target_unit ?? 'sec',
            benchmark_video_url: input.benchmark_video_url ?? null,
          });
        }}
      />
      <ConfirmDialog
        open={deleteStepId != null}
        title={t('skills.deleteStepConfirmTitle')}
        description={t('skills.deleteStepConfirmDesc')}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          if (deleteStepId) void removeSkillStep(deleteStepId);
          setDeleteStepId(null);
        }}
        onCancel={() => setDeleteStepId(null)}
      />
    </div>
  );
}
