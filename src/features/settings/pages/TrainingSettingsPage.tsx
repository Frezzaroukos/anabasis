import { useTranslation } from 'react-i18next';
import { updateSettings } from '@/lib/db/queries';
import { useAppSettings } from '@/hooks/useAppSettings';
import { Card, SectionTitle } from '@/components/ui/Section';
import { SettingsHeader } from '../components/SettingsList';

/** Πώς καταγράφεις: μονάδες βάρους. (Το rest timer αφαιρέθηκε — δες commit 820c2d5·
 *  το χρονόμετρο προπόνησης είναι πλέον χειροκίνητο μέσα στην ενεργή συνεδρία.) */
export function TrainingSettingsPage() {
  const { t } = useTranslation();
  const settings = useAppSettings();

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
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <SectionTitle className="mb-1">{t('settings.coach.title')}</SectionTitle>
            <p className="text-xs text-muted-foreground">{t('settings.coach.desc')}</p>
          </div>
          <button
            onClick={() => void updateSettings({ coach_enabled: !settings?.coach_enabled })}
            aria-pressed={settings?.coach_enabled}
            className={`ml-4 h-11 rounded-md px-4 text-sm font-medium uppercase transition-colors ${
              settings?.coach_enabled
                ? 'bg-primary text-primary-foreground'
                : 'bg-elevated hover:bg-accent'
            }`}
          >
            {settings?.coach_enabled ? t('common.on') : t('common.off')}
          </button>
        </div>
      </Card>
    </div>
  );
}
