import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Section';
import { Wordmark } from '@/components/Logo';
import { ShareCard } from '../components/ShareCard';
import { SettingsHeader } from '../components/SettingsList';

/**
 * Σχετικά & μοιράσου — τι είναι το app, ποιος το έφτιαξε, πώς το στέλνεις.
 *
 * Το ShareCard έφυγε από τη σελίδα των προφίλ: το «μοιράσου το Anabasis»
 * αφορά την εφαρμογή, όχι το ποιος χρησιμοποιεί τη συσκευή.
 */
export function AboutSettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('settings.about')} description={t('settings.aboutDesc')} />

      <Card className="text-center">
        <div className="flex justify-center">
          <Wordmark />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{t('app.tagline')}</p>
        <p className="mt-3 text-xs text-muted-foreground">{t('settings.offlineNote')}</p>
      </Card>

      <ShareCard />
    </div>
  );
}
