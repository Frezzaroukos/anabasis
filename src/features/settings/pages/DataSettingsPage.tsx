import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download } from 'lucide-react';
import {
  exportAll,
  exportProfile,
  getCurrentProfileDataCounts,
  importAll,
  previewImport,
  type ImportPreview,
} from '@/lib/db/queries';
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
  // Preview-before-import: κρατάμε το περιεχόμενο του αρχείου ΚΑΙ τη στεγνή
  // προεπισκόπηση, ώστε κανένα overwrite να μη γίνεται χωρίς ρητή επιβεβαίωση.
  const [pending, setPending] = useState<{ json: string; preview: ImportPreview } | null>(null);

  // ΠΡΟΣΟΧΗ: db.workouts.count() κλπ χωρίς φίλτρο user_id μετρούσαν δεδομένα
  // ΟΛΩΝ των προφίλ — «τα δικά σου» έδειχνε ξένα workouts/sets/PRs.
  const stats = useLiveQuery(() => getCurrentProfileDataCounts(), [], {
    workouts: 0,
    sets: 0,
    prs: 0,
    steps: 0,
  });

  const download = (json: string, name: string) => {
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const today = () => new Date().toISOString().slice(0, 10);

  // Προεπιλογή = ΜΟΝΟ το ενεργό προφίλ — ακριβώς ό,τι δείχνει το «Τα δεδομένα σου»
  // από πάνω. Σε κοινόχρηστη συσκευή δεν φεύγουν σιωπηλά τα άλλα προφίλ.
  const onExport = async () => {
    download(await exportProfile(), `anabasis-backup-${today()}.json`);
    setStatus(t('settings.exported'));
  };

  // Ρητή, ξεχωριστή ενέργεια: ΟΛΑ τα προφίλ αυτής της συσκευής (μετακόμιση).
  const onExportAllProfiles = async () => {
    download(await exportAll(), `anabasis-all-profiles-${today()}.json`);
    setStatus(t('settings.exported'));
  };

  // Βήμα 1: διάβασε το αρχείο και δείξε προεπισκόπηση (καμία εγγραφή ακόμα).
  const onImportFile = async (file: File) => {
    setStatus(null);
    const json = await file.text();
    const preview = await previewImport(json);
    if (!preview.ok) {
      setPending(null);
      setStatus(t(`settings.${preview.message}`));
      return;
    }
    setPending({ json, preview });
  };

  // Βήμα 2: ο χρήστης επιβεβαιώνει ρητά → εφαρμογή (με LWW, χωρίς clobber).
  const onConfirmImport = async () => {
    if (!pending) return;
    const res = await importAll(pending.json);
    setPending(null);
    setStatus(
      res.ok
        ? `${t('settings.imported')} (${Object.values(res.counts ?? {}).reduce((a, b) => a + b, 0)}${
            res.skipped ? `, ${t('settings.importKeptNewer', { count: res.skipped })}` : ''
          })`
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
              <dt className="text-xs uppercase text-muted-foreground">{t(`settings.${k}`)}</dt>
              <dd className="font-mono text-sm">{v}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card>
        <SectionTitle>{t('settings.export')}</SectionTitle>
        <p className="-mt-2 text-xs text-muted-foreground">{t('settings.storageNote')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={() => void onExport()}>{t('settings.exportProfile')}</Button>
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

        {/* Ρητή, δευτερεύουσα διαδρομή: ΟΛΑ τα προφίλ της συσκευής. */}
        <div className="mt-4 border-t border-border pt-3">
          <Button
            variant="ghost"
            className="h-auto px-0 text-xs text-muted-foreground"
            onClick={() => void onExportAllProfiles()}
          >
            {t('settings.exportAllProfiles')}
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">
            {t('settings.exportAllProfilesHint')}
          </p>
        </div>

        {/* Preview-before-import: ρητή επιβεβαίωση, με το τι ακριβώς θα γίνει. */}
        {pending && (
          <div className="mt-4 rounded-md border border-border bg-elevated p-3" role="group">
            <p className="text-sm font-medium">{t('settings.importPreviewTitle')}</p>
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <li>{t('settings.importAdd', { count: pending.preview.add })}</li>
              <li>{t('settings.importUpdate', { count: pending.preview.update })}</li>
              <li>{t('settings.importKeepNewer', { count: pending.preview.skip })}</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button onClick={() => void onConfirmImport()}>{t('settings.importConfirm')}</Button>
              <Button variant="outline" onClick={() => setPending(null)}>
                {t('common.cancel')}
              </Button>
            </div>
          </div>
        )}

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
