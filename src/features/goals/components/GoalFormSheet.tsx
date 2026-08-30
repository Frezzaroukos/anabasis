import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createGoal, updateGoal } from '@/lib/db/goals';
import { listActivities, listExercises } from '@/lib/db/queries';
import {
  BUILTIN_GOAL_METRICS,
  BUILTIN_GOAL_PERIODS,
  BUILTIN_PERIOD_ANCHORS,
} from '@/lib/db/types';
import type { Goal, GoalMetric, GoalPeriod, GoalPeriodAnchor } from '@/lib/db/types';
import { goalTitle } from '../goalTitle';
import { cn } from '@/lib/utils';

/** Μετρικές που αφορούν σετ — μόνο εκεί βγάζει νόημα να διαλέξεις άσκηση. */
const SET_LEVEL: GoalMetric[] = ['volume_kg', 'sets', 'reps'];

/**
 * Σύνθεση στόχου από τους τέσσερις άξονες.
 *
 * Η φόρμα δείχνει ΖΩΝΤΑΝΑ τον τίτλο που θα προκύψει («4 προπονήσεις /
 * εβδομάδα»), γιατί τέσσερα ανεξάρτητα πεδία είναι εύκολο να συνδυαστούν σε
 * κάτι που δεν εννοούσες. Το να το διαβάζεις σε φυσική γλώσσα πριν σώσεις
 * είναι ο έλεγχος.
 */
export function GoalFormSheet({
  open,
  onClose,
  goal,
}: {
  open: boolean;
  onClose: () => void;
  goal: Goal | null;
}) {
  const { t } = useTranslation();
  const activities = useLiveQuery(() => listActivities(), [], []);
  const exercises = useLiveQuery(() => listExercises(), [], []);

  const [metric, setMetric] = useState<GoalMetric>('sessions');
  const [period, setPeriod] = useState<GoalPeriod>('week');
  const [anchor, setAnchor] = useState<GoalPeriodAnchor>('calendar');
  const [target, setTarget] = useState('4');
  const [activityKey, setActivityKey] = useState<string | null>(null);
  const [exerciseId, setExerciseId] = useState<string | null>(null);
  const [label, setLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    setMetric(goal?.metric ?? 'sessions');
    setPeriod(goal?.period ?? 'week');
    setAnchor(goal?.period_anchor ?? 'calendar');
    setTarget(String(goal?.target ?? 4));
    setActivityKey(goal?.activity_key ?? null);
    setExerciseId(goal?.exercise_id ?? null);
    setLabel(goal?.label ?? '');
  }, [open, goal]);

  // Αλλάζοντας σε μετρική που δεν αφορά σετ, η επιλογή άσκησης παύει να έχει
  // νόημα — την καθαρίζουμε αντί να την κρατάμε κρυφά ενεργή.
  useEffect(() => {
    if (!SET_LEVEL.includes(metric)) setExerciseId(null);
  }, [metric]);

  const targetNum = Number(target.replace(',', '.'));
  const valid = Number.isFinite(targetNum) && targetNum > 0;

  const preview = goalTitle(
    t,
    { metric, target: valid ? targetNum : 0, period, activity_key: activityKey, exercise_id: exerciseId },
    {
      activity: activityKey ? (activities.find((a) => a.key === activityKey)?.label ?? null) : null,
      exercise: exerciseId ? (exercises.find((e) => e.id === exerciseId)?.name ?? null) : null,
    },
  );

  const save = async () => {
    if (!valid) return;
    const payload = {
      metric,
      target: targetNum,
      period,
      period_anchor: anchor,
      activity_key: activityKey,
      exercise_id: exerciseId,
      label: label.trim() || null,
    };
    if (goal) await updateGoal(goal.id, payload);
    else await createGoal(payload);
    onClose();
  };

  const chip = (active: boolean) =>
    cn(
      'rounded-full border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
      active
        ? 'border-primary bg-primary/10 font-medium text-foreground'
        : 'border-border/70 text-muted-foreground hover:text-foreground',
    );

  return (
    <BottomSheet open={open} onClose={onClose} title={goal ? t('goals.edit') : t('goals.new')}>
      <div className="space-y-5 px-4 pb-6">
        <Field label={t('goals.metricLabel')}>
          <div className="flex flex-wrap gap-2">
            {BUILTIN_GOAL_METRICS.map((m) => (
              <button key={m} type="button" onClick={() => setMetric(m)} className={chip(metric === m)}>
                {t(`goals.metric.${m}`)}
              </button>
            ))}
          </div>
        </Field>

        <div className="flex gap-3">
          <Field label={t('goals.targetLabel')} className="w-28">
            <Input
              inputMode="decimal"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="h-10 font-mono tabular-nums"
            />
          </Field>
          <Field label={t('goals.periodLabel')} className="flex-1">
            <div className="flex flex-wrap gap-2">
              {BUILTIN_GOAL_PERIODS.map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)} className={chip(period === p)}>
                  {t(`goals.period.${p}`)}
                </button>
              ))}
            </div>
          </Field>
        </div>

        {/*
          Πότε μηδενίζει ο μετρητής. Δύο εξίσου σωστές νοοτροπίες, οπότε
          διαλέγει ο χρήστης — και εξηγούμε τη διαφορά από κάτω, γιατί
          «ημερολογιακό/κυλιόμενο» δεν λέει τίποτα από μόνο του.
        */}
        <Field label={t('goals.anchorLabel')}>
          <div className="flex gap-2">
            {BUILTIN_PERIOD_ANCHORS.map((a) => (
              <button key={a} type="button" onClick={() => setAnchor(a)} className={chip(anchor === a)}>
                {t(`goals.anchor.${a}`)}
              </button>
            ))}
          </div>
          <span className="mt-1 text-[11px] leading-snug text-muted-foreground">
            {t(`goals.anchorHint.${anchor}.${period}`)}
          </span>
        </Field>

        <Field label={t('goals.activityLabel')}>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setActivityKey(null)} className={chip(activityKey === null)}>
              {t('goals.all')}
            </button>
            {activities.map((a) => (
              <button
                key={a.key}
                type="button"
                onClick={() => setActivityKey(a.key)}
                className={chip(activityKey === a.key)}
              >
                {a.label}
              </button>
            ))}
          </div>
        </Field>

        {SET_LEVEL.includes(metric) && (
          <Field label={t('goals.exerciseLabel')}>
            <select
              value={exerciseId ?? ''}
              onChange={(e) => setExerciseId(e.target.value || null)}
              className="h-10 w-full rounded-md bg-elevated px-3 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <option value="">{t('goals.all')}</option>
              {exercises.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </Field>
        )}

        <Field label={t('goals.nameLabel')}>
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={preview}
            className="h-10"
          />
        </Field>

        <div className="rounded-lg bg-muted/40 px-3 py-2.5">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {t('goals.preview')}
          </p>
          <p className="mt-1 text-sm font-medium">{label.trim() || preview}</p>
        </div>

        <Button className="w-full" onClick={() => void save()} disabled={!valid}>
          {t('common.save')}
        </Button>
      </div>
    </BottomSheet>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
