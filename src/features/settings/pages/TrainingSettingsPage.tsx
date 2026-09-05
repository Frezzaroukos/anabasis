import { useTranslation } from 'react-i18next';
import { updateSettings } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Card, SectionTitle } from '@/components/ui/Section';
import { SettingsHeader } from '../components/SettingsList';

const REST_PRESETS = [60, 90, 120, 180, 240, 300];

/** Διακόπτης on/off — ίδια γλώσσα σε όλες τις ρυθμίσεις προπόνησης. */
function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
      <div>
        <p className="text-sm">{label}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>
      </div>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        className={`h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? 'bg-primary shadow-glow-sm' : 'bg-muted'
        }`}
      >
        <span
          className={`block h-4 w-4 rounded-full bg-background transition-transform duration-200 ${
            checked ? 'translate-x-6' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}

/** Πώς καταγράφεις: χρονόμετρο ξεκούρασης και μονάδες βάρους. */
export function TrainingSettingsPage() {
  const { t } = useTranslation();
  const settings = useAppSettings();
  const notify = settings?.notify_rest_timer ?? true;
  const autoStart = settings?.auto_start_rest_timer ?? true;

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('settings.training')} description={t('settings.trainingDesc')} />

      <Card>
        <SectionTitle>{t('settings.restTimer')}</SectionTitle>
        <div className="flex flex-wrap gap-2">
          {REST_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => void updateSettings({ default_rest_timer_seconds: s })}
              aria-pressed={settings?.default_rest_timer_seconds === s}
              className={`h-11 min-w-[3.5rem] rounded-md px-3 font-mono text-sm transition-colors ${
                settings?.default_rest_timer_seconds === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-elevated hover:bg-accent'
              }`}
            >
              {s < 60 ? `${s}s` : `${s / 60}m`}
            </button>
          ))}
        </div>
        <Toggle
          label={t('settings.restNotify')}
          hint={t('settings.restNotifyHint')}
          checked={notify}
          onChange={() => void updateSettings({ notify_rest_timer: !notify })}
        />
        <Toggle
          label={t('settings.restAutoStart')}
          hint={t('settings.restAutoStartHint')}
          checked={autoStart}
          onChange={() => void updateSettings({ auto_start_rest_timer: !autoStart })}
        />
      </Card>

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
    </div>
  );
}
