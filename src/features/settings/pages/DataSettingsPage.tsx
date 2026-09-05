import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download } from 'lucide-react';
import { exportAll, getCurrentProfileDataCounts, importAll } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, SectionTitle } from '@/components/ui/Section';
import { CrossLink, SettingsHeader } from '../components/SettingsList';

/**
 * Τα δεδομένα σου — τι υπάρχει και πώς φεύγει.
 *
 * Local-first σημαίνει ότι φεύγουν όποτε θες: η εξαγωγή δεν είναι κρυμμένη
 * λειτουργία αλλά η μισή σελίδα.
 */
export function DataSettingsPage() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);

  // ΠΡΟΣΟΧΗ: db.workouts.count() κλπ χωρίς φίλτρο user_id μετρούσαν δεδομένα
  // ΟΛΩΝ των προφίλ — «τα δικά σου» έδειχνε ξένα workouts/sets/PRs.
  const stats = useLiveQuery(() => getCurrentProfileDataCounts(), [], {
    workouts: 0,
    sets: 0,
    prs: 0,
    steps: 0,
  });

  const onExport = async () => {
    const json = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anabasis-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(t('settings.exported'));
  };

  const onImportFile = async (file: File) => {
    const res = await importAll(await file.text());
    setStatus(
      res.ok
        ? `${t('settings.imported')} (${Object.values(res.counts ?? {}).reduce((a, b) => a + b, 0)})`
        : t(`settings.${res.message}`),
    );
  };

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('settings.data')} description={t('settings.dataDesc')} />

      <Card>
        <SectionTitle>{t('settings.yourData')}</SectionTitle>
        <p className="-mt-2 text-xs text-muted-foreground">{t('settings.dataOfProfile')}</p>
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          {(
            [
              ['workouts', stats.workouts],
              ['sets', stats.sets],
              ['prs', stats.prs],
              ['skillSteps', stats.steps],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-md bg-elevated py-2">
              <dt className="text-[10px] uppercase text-muted-foreground">{t(`settings.${k}`)}</dt>
              <dd className="font-mono text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <SectionTitle>{t('settings.export')}</SectionTitle>
        <p className="-mt-2 text-xs text-muted-foreground">{t('settings.storageNote')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void onExport()}>{t('settings.export')}</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            {t('settings.import')}
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {status && (
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            {status}
          </p>
        )}
      </Card>

      {/* Διαφορετικό πράγμα από το backup: εισαγωγή από ΑΛΛΗ εφαρμογή. */}
      <CrossLink to="/import" label={t('import.title')} />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('settings.dataHint')}
      </p>
    </div>
  );
}
