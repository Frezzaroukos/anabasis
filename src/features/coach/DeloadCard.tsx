/**
 * DeloadCard — shows when deload risk is detected.
 *
 * Only renders when coach_enabled AND detectDeloadRisk level >= 'caution'.
 * Quiet, not spammy.
 */

import { useTranslation } from 'react-i18next';
import { BatteryLow } from 'lucide-react';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useCoachData } from './useCoachData';

export function DeloadCard() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const enabled = !!settings?.coach_enabled;

  // Hook ΠΑΝΤΑ (rules-of-hooks)· δεν τρέχει queries όταν off.
  const { deloadRisk, loading } = useCoachData(enabled);

  // Gate: off, loading, ή normal risk → τίποτα.
  if (!enabled || loading || deloadRisk.level === 'normal') {
    return null;
  }

  return (
    <div className="space-y-3 rounded-lg border border-amber-500/20 bg-amber-50/50 p-4 dark:border-amber-500/30 dark:bg-amber-950/20">
      <div className="flex items-center gap-2">
        <BatteryLow className="h-5 w-5 text-amber-600 dark:text-amber-400" />
        <h3 className="font-semibold text-amber-900 dark:text-amber-200">{t('coach.deload.title')}</h3>
      </div>

      {deloadRisk.reasons.length > 0 && (
        <ul className="space-y-1 text-xs text-amber-800 dark:text-amber-300">
          {deloadRisk.reasons.map((reason, i) => (
            <li key={i} className="list-inside list-disc">
              {reason}
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-amber-900 dark:text-amber-200">{t('coach.deload.consider')}</p>
    </div>
  );
}
