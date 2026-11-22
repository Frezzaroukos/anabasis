import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { updateSettings } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Card, SectionTitle } from '@/components/ui/Section';
import { SettingsHeader } from '../components/SettingsList';
import { useIsPro } from '@/lib/api/auth';

/**
 * Πώς καταγράφεις: μονάδες βάρους + ανάπαυση μεταξύ σετ. Το χρονόμετρο
 * προπόνησης είναι χειροκίνητο (820c2d5)· το rest timer ξεκινά μόνο του μετά από
 * σετ ΜΟΝΟ όσο είναι ενεργό το «Αυτόματο» — εδώ το ανοιγοκλείνεις και ορίζεις
 * διάρκεια/ειδοποίηση. Οι ρυθμίσεις υπήρχαν στη βάση αλλά δεν είχαν UI.
 */
const REST_PRESETS = [60, 90, 120, 180, 240, 300] as const;

const fmtRest = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function Toggle({
  on,
  label,
  onClick,
  t,
}: {
  on: boolean;
  label: string;
  onClick: () => void;
  t: (k: string) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      className={`h-11 shrink-0 rounded-md px-4 text-sm font-medium uppercase transition-colors ${
        on ? 'bg-primary text-primary-foreground' : 'bg-elevated hover:bg-accent'
      }`}
    >
      {on ? t('common.on') : t('common.off')}
    </button>
  );
}
export function TrainingSettingsPage() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const isPro = useIsPro();

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('settings.training')} description={t('settings.trainingDesc')} />

      <Card>
        <SectionTitle>{t('settings.units')}</SectionTitle>
        <div className="flex gap-2">
          {(['kg', 'lb'] as const).map((u) => (
            <button
              key={u}
              onClick={() => void updateSettings({ weight_unit: u })}
              aria-pressed={settings?.weight_unit === u}
              className={`h-11 rounded-md px-4 text-sm uppercase transition-colors ${
                settings?.weight_unit === u
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-elevated hover:bg-accent'
              }`}
            >
              {t(`common.${u}`)}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <SectionTitle>{t('settings.restTimer')}</SectionTitle>
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('settings.restTimer')}>
          {REST_PRESETS.map((sec) => (
            <button
              key={sec}
              type="button"
              onClick={() => void updateSettings({ default_rest_timer_seconds: sec })}
              aria-pressed={settings?.default_rest_timer_seconds === sec}
              className={`h-11 min-w-14 rounded-md px-3 font-mono text-sm tabular-nums transition-colors ${
                settings?.default_rest_timer_seconds === sec
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-elevated hover:bg-accent'
              }`}
            >
              {fmtRest(sec)}
            </button>
          ))}
        </div>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium">{t('settings.restAutoStart')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.restAutoStartHint')}</p>
          </div>
          <Toggle
            t={t}
            on={!!settings?.auto_start_rest_timer}
            label={t('settings.restAutoStart')}
            onClick={() => void updateSettings({ auto_start_rest_timer: !settings?.auto_start_rest_timer })}
          />
        </div>
        <div className="mt-4 flex items-start justify-between gap-4">
          <div className="flex-1">
            <p className="text-sm font-medium">{t('settings.restNotify')}</p>
            <p className="text-xs text-muted-foreground">{t('settings.restNotifyHint')}</p>
          </div>
          <Toggle
            t={t}
            on={!!settings?.notify_rest_timer}
            label={t('settings.restNotify')}
            onClick={() => void updateSettings({ notify_rest_timer: !settings?.notify_rest_timer })}
          />
        </div>
      </Card>

      <Card>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <SectionTitle className="mb-1">{t('settings.coach.title')}</SectionTitle>
            <p className="text-xs text-muted-foreground">{t('settings.coach.desc')}</p>
            {!isPro && (
              <p className="mt-2 text-xs text-muted-foreground">{t('settings.coach.proOnly')}</p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => void updateSettings({ coach_enabled: !settings?.coach_enabled })}
              disabled={!isPro}
              aria-pressed={isPro && !!settings?.coach_enabled}
              className={`h-11 rounded-md px-4 text-sm font-medium uppercase transition-colors ${
                isPro && settings?.coach_enabled
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-elevated hover:bg-accent'
              } disabled:cursor-not-allowed disabled:opacity-45`}
            >
              {isPro && settings?.coach_enabled ? t('common.on') : t('common.off')}
            </button>
            {!isPro && (
              <Link
                to="/settings/account"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <Lock className="h-3 w-3" aria-hidden="true" />
                {t('account.upgrade')}
              </Link>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
