import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Label,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
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
import {
  ACCENT_FILL_ID,
  ACTIVE_DOT,
  CHART_GOLD,
  CHART_GRID,
  CHART_STROKE,
  CHART_STROKE_WIDTH,
  CHART_TICK,
  ChartGradientDefs,
  TOOLTIP_STYLE,
} from '@/components/charts/chartTheme';
import { StepFormSheet } from './components/StepFormSheet';
import { cn } from '@/lib/utils';

interface LadderPoint {
  date: string;
  stepNumber: number;
  stepName: string;
  value: number;
  unit: string;
  addedWeight: number | null;
}

interface LadderDotProps {
  cx?: number;
  cy?: number;
  payload?: LadderPoint;
}

/** Χρυσή κουκκίδα όταν το βήμα κατακτήθηκε ΜΕ επιπλέον βάρος — ίδιο σήμα με τα PR. */
function LadderDot({ cx, cy, payload }: LadderDotProps) {
  if (cx == null || cy == null) return null;
  const weighted = payload?.addedWeight != null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={weighted ? 4 : 2}
      fill={weighted ? CHART_GOLD : 'hsl(var(--primary))'}
      strokeWidth={0}
    />
  );
}

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
  const [weightDraft, setWeightDraft] = useState<Record<string, string>>({});
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
  const masteredSkill = progress?.status === 'mastered';

  // Η πρόοδος της σκάλας στον χρόνο — πότε πέτυχες κάθε βήμα, με πόσο βάρος.
  // Αυτό είναι ΤΟ chart του skill (owner feedback: progression πρέπει να φαίνεται).
  const ladderPoints: LadderPoint[] = steps
    .map((step) => {
      const c = completions.get(step.id);
      if (!c) return null;
      return {
        date: c.achieved_at.slice(0, 10),
        stepNumber: step.step_number,
        stepName: step.name,
        value: c.achieved_value,
        unit: step.target_unit,
        addedWeight: c.added_weight_kg,
      };
    })
    .filter((p): p is LadderPoint => p !== null)
    .sort((a, b) => a.date.localeCompare(b.date));

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
            <h1 className="font-display text-2xl font-semibold tracking-tight">{skill.name}</h1>
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

        {/*
          Οι στόχοι είναι ΠΡΟΤΑΣΕΙΣ, όχι πρότυπο — οι πηγές διαφωνούν ανοιχτά
          (10-15s ως 30-60s για το ίδιο βήμα). Το λέμε ρητά, αλλιώς ένας
          αρχάριος τα διαβάζει ως κανόνα και ένας προπονητής ως λάθος.
        */}
        <p className="rounded-lg bg-muted/40 px-3 py-2 text-[11px] leading-snug text-muted-foreground">
          {t('skills.targetsAreSuggestions')}
        </p>

        <div className="pt-2">
          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
            <span className="font-mono">
              {doneCount}/{steps.length} {t('skills.stepsDone')}
            </span>
            <span className="font-mono">{pct}%</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                'h-full rounded-full transition-all',
                progress?.status === 'mastered' ? 'bg-gold' : 'bg-primary',
              )}
              style={{ width: `${pct}%` }}
            />
          </div>
          {progress?.status === 'mastered' && (
            <p className="mt-2 text-sm font-medium text-gold">
              ★ {t('skills.mastered')}
            </p>
          )}
        </div>
      </header>

      {/*
        Η σκάλα — κύκλοι συνδεδεμένοι με κάθετη γραμμή, όχι ξεχωριστές
        κάρτες. Το κλειδωμένο βήμα ΜΕΝΕΙ ορατό (απλά υποτονισμένο): ο
        αθλητής πρέπει να βλέπει πού πάει, όχι μόνο πού είναι.
      */}
      <ol className="stagger">
        {steps.map((step, i) => {
          const done = completions.get(step.id);
          const isCurrent = i === currentIdx;
          const locked = currentIdx !== -1 && i > currentIdx;
          const isLast = i === steps.length - 1;
          // Η κορυφή της σκάλας, όταν το skill έχει κατακτηθεί — το ένα
          // σημείο που παίρνει χρυσό αντί για accent (gold = ΜΟΝΟ επίτευξη).
          const isPeak = done && masteredSkill && isLast;

          return (
            <li key={step.id} className="flex gap-3 pb-5 last:pb-0">
              <div className="flex flex-col items-center">
                <span
                  className={cn(
                    'z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors',
                    isPeak
                      ? 'bg-gold text-background'
                      : done
                        ? 'bg-primary text-primary-foreground'
                        : isCurrent
                          ? 'animate-ladder-step bg-elevated text-primary ring-2 ring-primary'
                          : 'bg-muted text-muted-foreground',
                  )}
                >
                  {done ? '✓' : step.step_number}
                </span>
                {!isLast && (
                  <span
                    aria-hidden
                    className={cn('mt-1 w-px flex-1', done ? 'bg-primary/50' : 'bg-border')}
                  />
                )}
              </div>

              <div
                className={cn(
                  'min-w-0 flex-1 rounded-lg px-3 py-2.5 transition-colors',
                  isCurrent && 'bg-elevated',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className={cn(
                      'text-sm font-medium',
                      locked && 'text-muted-foreground',
                    )}
                  >
                    {step.name}
                  </p>
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
                  {step.added_weight_kg != null && ` + ${step.added_weight_kg}kg`}
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
                  <p className="mt-2 text-xs text-primary">
                    {t('skills.achieved')}:{' '}
                    <span className="font-mono">
                      {done.achieved_value} {step.target_unit}
                      {done.added_weight_kg != null && (
                        <span className="text-gold"> + {done.added_weight_kg}kg</span>
                      )}
                    </span>
                    {' · '}
                    {new Date(done.achieved_at).toLocaleDateString()}
                  </p>
                )}

                {isCurrent && (
                  <div className="mt-3 flex flex-wrap gap-2">
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
                    <Input
                      type="number"
                      inputMode="decimal"
                      className="h-9 w-28"
                      placeholder={
                        step.added_weight_kg != null
                          ? String(step.added_weight_kg)
                          : t('skills.addedWeightPlaceholder')
                      }
                      value={weightDraft[step.id] ?? ''}
                      onChange={(e) =>
                        setWeightDraft((d) => ({ ...d, [step.id]: e.target.value }))
                      }
                      aria-label={t('skills.addedWeight')}
                    />
                    <Button
                      className="h-9"
                      onClick={() => {
                        const v = Number(draft[step.id] ?? step.target_value);
                        const wRaw = weightDraft[step.id]?.trim();
                        const w = wRaw ? Number(wRaw) : null;
                        void achieveStep(
                          skillId,
                          step.id,
                          Number.isFinite(v) ? v : step.target_value,
                          w != null && Number.isFinite(w) ? w : null,
                        );
                        setDraft((d) => ({ ...d, [step.id]: '' }));
                        setWeightDraft((d) => ({ ...d, [step.id]: '' }));
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
            </li>
          );
        })}
      </ol>

      {/* Πρόοδος στον χρόνο — πότε πέτυχες κάθε βήμα, με πόσο βάρος. Χρυσή
          κουκκίδα = weighted completion (ίδιο σήμα με PR), χρυσή γραμμή = κορυφή. */}
      <section className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">{t('skills.progressOverTime')}</h2>
        {ladderPoints.length < 2 ? (
          <div className="rounded-lg bg-card p-6 text-center text-sm text-muted-foreground">
            {t('progress.needMore')}
          </div>
        ) : (
          <div className="rounded-lg bg-card p-4">
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={ladderPoints} margin={{ top: 4, right: 6, bottom: 0, left: -18 }}>
                  <ChartGradientDefs />
                  <CartesianGrid strokeDasharray="3 3" stroke={CHART_GRID} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(d: string) => d.slice(5)}
                    tick={CHART_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    dataKey="stepNumber"
                    domain={[1, Math.max(steps.length, 2)]}
                    allowDecimals={false}
                    tick={CHART_TICK}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={TOOLTIP_STYLE}
                    labelFormatter={(d: string) => new Date(d).toLocaleDateString()}
                    formatter={(_value: number, _name: string, entry: { payload?: LadderPoint }) => {
                      const p = entry.payload;
                      if (!p) return ['', ''];
                      const weight = p.addedWeight != null ? ` +${p.addedWeight}kg` : '';
                      return [`${p.value} ${p.unit}${weight}`, p.stepName];
                    }}
                  />
                  {!masteredSkill && (
                    <ReferenceLine y={steps.length} stroke={CHART_GOLD} strokeDasharray="4 3">
                      <Label
                        value={t('skills.mastered')}
                        position="insideTopRight"
                        fill={CHART_GOLD}
                        className="text-[10px]"
                      />
                    </ReferenceLine>
                  )}
                  <Area
                    type="stepAfter"
                    dataKey="stepNumber"
                    stroke={CHART_STROKE}
                    strokeWidth={CHART_STROKE_WIDTH}
                    fill={`url(#${ACCENT_FILL_ID})`}
                    dot={(props: LadderDotProps) => (
                      <LadderDot key={props.payload?.date} cx={props.cx} cy={props.cy} payload={props.payload} />
                    )}
                    activeDot={ACTIVE_DOT}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}
      </section>

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
            added_weight_kg: input.added_weight_kg ?? null,
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
