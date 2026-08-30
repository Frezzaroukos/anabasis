import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BottomSheet } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BUILTIN_SKILL_TARGET_TYPES } from '@/lib/db/types';
import type { SkillStep } from '@/lib/db/types';
import type { SkillStepInput } from '@/lib/db/queries';
import { cn } from '@/lib/utils';

const DEFAULT_UNIT_SUGGESTIONS = ['sec', 'reps', 'cm', 'm', '°', 'kg'];

interface StepFormSheetProps {
  open: boolean;
  onClose: () => void;
  onSubmit: (input: SkillStepInput) => void | Promise<void>;
  /** Αν δοθεί → edit mode, προγεμίζει τη φόρμα με τις τιμές του βήματος. */
  initial?: SkillStep;
  /** Μονάδες που χρησιμοποιούνται ήδη σε αυτό το skill, μπαίνουν πρώτες στις προτάσεις. */
  unitSuggestions?: string[];
}

/**
 * Φόρμα προσθήκης/επεξεργασίας βήματος. Target type & unit είναι ελεύθερο
 * κείμενο με προτάσεις-chips — ο χρήστης δεν κλειδώνεται σε hold/reps/distance/angle,
 * μπορεί να γράψει «tempo», «negatives» ή ό,τι άλλο περιγράφει το βήμα του.
 */
export function StepFormSheet({
  open,
  onClose,
  onSubmit,
  initial,
  unitSuggestions = [],
}: StepFormSheetProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [targetType, setTargetType] = useState('hold');
  const [targetValue, setTargetValue] = useState('');
  const [targetUnit, setTargetUnit] = useState('sec');
  const [addedWeightKg, setAddedWeightKg] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [busy, setBusy] = useState(false);

  // Ξαναγεμίζει τη φόρμα κάθε φορά που ανοίγει — είτε νέο βήμα, είτε άλλο προς επεξεργασία.
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? '');
    setDescription(initial?.description ?? '');
    setTargetType(initial?.target_type ?? 'hold');
    setTargetValue(initial ? String(initial.target_value) : '');
    setTargetUnit(initial?.target_unit ?? 'sec');
    setAddedWeightKg(initial?.added_weight_kg != null ? String(initial.added_weight_kg) : '');
    setVideoUrl(initial?.benchmark_video_url ?? '');
  }, [open, initial]);

  const units = [...new Set([...unitSuggestions, ...DEFAULT_UNIT_SUGGESTIONS])];

  const onSave = async () => {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await onSubmit({
        name: trimmed,
        description: description.trim() || undefined,
        target_type: targetType.trim() || undefined,
        target_value: targetValue.trim() ? Number(targetValue) : undefined,
        target_unit: targetUnit.trim() || undefined,
        added_weight_kg: addedWeightKg.trim() ? Number(addedWeightKg) : null,
        benchmark_video_url: videoUrl.trim() || null,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={initial ? t('skills.editStep') : t('skills.addStep')}
    >
      <div className="space-y-3 px-4 pb-6">
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('skills.stepNamePlaceholder')}
          aria-label={t('skills.stepNamePlaceholder')}
        />
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('skills.stepDescriptionPlaceholder')}
          aria-label={t('skills.stepDescriptionPlaceholder')}
        />

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('skills.targetType')}</p>
          <Input
            value={targetType}
            onChange={(e) => setTargetType(e.target.value)}
            aria-label={t('skills.targetType')}
          />
          <div className="flex flex-wrap gap-2">
            {BUILTIN_SKILL_TARGET_TYPES.map((tt) => (
              <button
                key={tt}
                type="button"
                onClick={() => setTargetType(tt)}
                className={cn(
                  'rounded-md border border-border px-2.5 py-1 text-xs transition-colors',
                  targetType === tt
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-accent',
                )}
              >
                {tt}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            type="number"
            inputMode="decimal"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            placeholder={t('skills.targetValue')}
            aria-label={t('skills.targetValue')}
            className="flex-1"
          />
          <Input
            value={targetUnit}
            onChange={(e) => setTargetUnit(e.target.value)}
            placeholder={t('skills.targetUnit')}
            aria-label={t('skills.targetUnit')}
            className="flex-1"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {units.map((u) => (
            <button
              key={u}
              type="button"
              onClick={() => setTargetUnit(u)}
              className={cn(
                'rounded-md border border-border px-2.5 py-1 text-xs transition-colors',
                targetUnit === u
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent',
              )}
            >
              {u}
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <p className="text-xs text-muted-foreground">{t('skills.addedWeight')}</p>
          <Input
            type="number"
            inputMode="decimal"
            value={addedWeightKg}
            onChange={(e) => setAddedWeightKg(e.target.value)}
            placeholder={t('skills.addedWeightPlaceholder')}
            aria-label={t('skills.addedWeight')}
          />
        </div>

        <Input
          value={videoUrl}
          onChange={(e) => setVideoUrl(e.target.value)}
          placeholder={t('skills.videoUrlPlaceholder')}
          aria-label={t('skills.videoUrlPlaceholder')}
        />

        <div className="flex gap-2 pt-2">
          <Button className="flex-1" disabled={!name.trim() || busy} onClick={() => void onSave()}>
            {t('common.save')}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
