import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Download, FileSpreadsheet, ShieldCheck, Trash2, Wrench } from 'lucide-react';
import {
  exportAll,
  exportProfile,
  getCurrentProfileDataCounts,
  importAll,
  previewImport,
  type ImportPreview,
} from '@/lib/db/queries';
import { exportSetsCsv, exportWorkoutsCsv } from '@/lib/db/csvExport';
import {
  checkDataIntegrity,
  repairDataIntegrity,
  type IntegrityReport,
} from '@/lib/db/integrity';
import { deleteCurrentProfileData } from '@/lib/db/wipe';
import { getCurrentUserId } from '@/lib/db/session';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Card, SectionTitle } from '@/components/ui/Section';
import { CrossLink, SettingsHeader } from '../components/SettingsList';

type Busy = 'export' | 'exportAll' | 'preview' | 'import' | 'csvWorkouts' | 'csvSets' | 'check' | 'repair' | 'wipe';

/**
 * Τα δεδομένα σου — τι υπάρχει και πώς φεύγει.
 *
 * Local-first σημαίνει ότι φεύγουν όποτε θες: η εξαγωγή δεν είναι κρυμμένη
 * λειτουργία αλλά η μισή σελίδα. Δίπλα στο JSON backup (επαναφορά) υπάρχει
 * CSV για Excel (ανάλυση), έλεγχος ακεραιότητας και — με διπλή επιβεβαίωση —
 * διαγραφή όλων των δεδομένων του ενεργού προφίλ.
 */
export function DataSettingsPage() {
  const { t } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState<Busy | null>(null);
  // Preview-before-import: κρατάμε το περιεχόμενο του αρχείου ΚΑΙ τη στεγνή
  // προεπισκόπηση, ώστε κανένα overwrite να μη γίνεται χωρίς ρητή επιβεβαίωση.
  const [pending, setPending] = useState<{ json: string; preview: ImportPreview } | null>(null);
  const [integrity, setIntegrity] = useState<IntegrityReport | null>(null);
  // 0 = κλειστό, 1 = πρώτο confirm, 2 = τελικό confirm. Δύο διαφορετικά
  // dialogs — όχι ένα κουμπί που «καταλαβαίνει» διπλό πάτημα.
  const [wipeStep, setWipeStep] = useState<0 | 1 | 2>(0);

  // ΠΡΟΣΟΧΗ: db.workouts.count() κλπ χωρίς φίλτρο user_id μετρούσαν δεδομένα
  // ΟΛΩΝ των προφίλ — «τα δικά σου» έδειχνε ξένα workouts/sets/PRs.
  const stats = useLiveQuery(() => getCurrentProfileDataCounts(), [], {
    workouts: 0,
    sets: 0,
    prs: 0,
    steps: 0,
  });

  const download = (content: string, name: string, type: string) => {
    const blob = new Blob([content], { type });
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
    setBusy('export');
    try {
      download(await exportProfile(), `anabasis-backup-${today()}.json`, 'application/json');
      setStatus(t('settings.exported'));
    } finally {
      setBusy(null);
    }
  };

  // Ρητή, ξεχωριστή ενέργεια: ΟΛΑ τα προφίλ αυτής της συσκευής (μετακόμιση).
  const onExportAllProfiles = async () => {
    setBusy('exportAll');
    try {
      download(
        await exportAll(),
        `anabasis-all-profiles-${today()}.json`,
        'application/json',
      );
      setStatus(t('settings.exported'));
    } finally {
      setBusy(null);
    }
  };

  const onExportCsv = async (kind: 'workouts' | 'sets') => {
    setBusy(kind === 'workouts' ? 'csvWorkouts' : 'csvSets');
    try {
      const csv = kind === 'workouts' ? await exportWorkoutsCsv() : await exportSetsCsv();
      download(csv, `anabasis-${kind}-${today()}.csv`, 'text/csv;charset=utf-8');
      setStatus(t('settings.csvExported'));
    } finally {
      setBusy(null);
    }
  };

  // Βήμα 1: διάβασε το αρχείο και δείξε προεπισκόπηση (καμία εγγραφή ακόμα).
  const onImportFile = async (file: File) => {
    setStatus(null);
    setBusy('preview');
    try {
      const json = await file.text();
      const preview = await previewImport(json);
      if (!preview.ok) {
        setPending(null);
        setStatus(t(`settings.${preview.message}`));
        return;
      }
      setPending({ json, preview });
    } finally {
      setBusy(null);
    }
  };

  // Βήμα 2: ο χρήστης επιβεβαιώνει ρητά → εφαρμογή (με LWW, χωρίς clobber).
  const onConfirmImport = async () => {
    if (!pending) return;
    setBusy('import');
    try {
      const res = await importAll(pending.json);
      setPending(null);
      setStatus(
        res.ok
          ? `${t('settings.imported')} (${Object.values(res.counts ?? {}).reduce((a, b) => a + b, 0)}${
              res.skipped ? `, ${t('settings.importKeptNewer', { count: res.skipped })}` : ''
            })`
          : t(`settings.${res.message}`),
      );
    } finally {
      setBusy(null);
    }
  };

  const onCheck = async () => {
    setBusy('check');
    try {
      const report = await checkDataIntegrity();
      setIntegrity(report);
      setStatus(null);
    } finally {
      setBusy(null);
    }
  };

  const onRepair = async () => {
    setBusy('repair');
    try {
      const res = await repairDataIntegrity();
      const report = await checkDataIntegrity();
      setIntegrity(report);
      setStatus(t('settings.repaired', { count: res.total }));
    } finally {
      setBusy(null);
    }
  };

  const onWipe = async () => {
    setBusy('wipe');
    try {
      await deleteCurrentProfileData();
      setWipeStep(0);
      setIntegrity(null);
      setStatus(t('settings.deletedAll'));
    } finally {
      setBusy(null);
    }
  };

  const importProfileMismatch =
    pending?.preview.scope === 'profile' &&
    pending.preview.profileId != null &&
    pending.preview.profileId !== getCurrentUserId();

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
          <Button loading={busy === 'export'} onClick={() => void onExport()}>
            {t('settings.exportProfile')}
          </Button>
          <Button
            variant="outline"
            loading={busy === 'preview'}
            onClick={() => fileRef.current?.click()}
          >
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

        {/* CSV = ανάλυση, όχι επαναφορά. Ξεχωριστό block για να μη μπερδεύεται
            με το JSON backup. */}
        <div className="mt-4 border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden />
            {t('settings.exportCsv')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('settings.exportCsvHint')}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              loading={busy === 'csvWorkouts'}
              onClick={() => void onExportCsv('workouts')}
            >
              {t('settings.exportWorkoutsCsv')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              loading={busy === 'csvSets'}
              onClick={() => void onExportCsv('sets')}
            >
              {t('settings.exportSetsCsv')}
            </Button>
          </div>
        </div>

        {/* Ρητή, δευτερεύουσα διαδρομή: ΟΛΑ τα προφίλ της συσκευής. */}
        <div className="mt-4 border-t border-border pt-3">
          <Button
            variant="ghost"
            className="h-auto min-h-11 px-0 text-xs text-muted-foreground"
            loading={busy === 'exportAll'}
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
            <p className="mt-1 text-xs text-muted-foreground">
              {pending.preview.scope === 'device'
                ? t('settings.importScopeDevice')
                : pending.preview.scope === 'profile'
                  ? t('settings.importScopeProfile')
                  : t('settings.importScopeUnknown')}
            </p>
            {importProfileMismatch && (
              <p className="mt-1 rounded-md bg-amber-500/10 px-2 py-1.5 text-xs text-amber-600 dark:text-amber-400">
                {t('settings.importScopeOtherProfile')}
              </p>
            )}
            <ul className="mt-2 space-y-0.5 text-xs text-muted-foreground">
              <li>{t('settings.importAdd', { count: pending.preview.add })}</li>
              <li>{t('settings.importUpdate', { count: pending.preview.update })}</li>
              <li>{t('settings.importKeepNewer', { count: pending.preview.skip })}</li>
            </ul>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button loading={busy === 'import'} onClick={() => void onConfirmImport()}>
                {t('settings.importConfirm')}
              </Button>
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

      {/* Έλεγχος/επιδιόρθωση orphan rows — χωρίς αυτό, μια λάθος διαγραφή
          γονέα άφηνε αόρατα «σκουπίδια» που ταξίδευαν και με sync. */}
      <Card>
        <SectionTitle>{t('settings.integrity')}</SectionTitle>
        <p className="-mt-2 text-xs text-muted-foreground">{t('settings.integrityDesc')}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            loading={busy === 'check'}
            onClick={() => void onCheck()}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden />
            {t('settings.integrityCheck')}
          </Button>
          {integrity && !integrity.ok && (
            <Button
              size="sm"
              loading={busy === 'repair'}
              onClick={() => void onRepair()}
            >
              <Wrench className="h-4 w-4" aria-hidden />
              {t('settings.integrityRepair')}
            </Button>
          )}
        </div>
        {integrity && (
          <div className="mt-3" role="status">
            {integrity.ok ? (
              <p className="text-xs text-primary">{t('settings.integrityClean')}</p>
            ) : (
              <>
                <p className="text-xs font-medium">
                  {t('settings.integrityIssues', { count: integrity.total })}
                </p>
                <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                  {integrity.issues.map((issue) => (
                    <li key={issue.code}>
                      {t(`settings.integrity_${issue.code}`)}: {issue.count}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
      </Card>

      {/* Διαφορετικό πράγμα από το backup: εισαγωγή από ΑΛΛΗ εφαρμογή. */}
      <CrossLink to="/import" label={t('import.title')} />
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Download className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('settings.dataHint')}
      </p>

      <Card className="border border-destructive/30">
        <SectionTitle>{t('settings.dangerZone')}</SectionTitle>
        <p className="-mt-2 text-xs text-muted-foreground">{t('settings.deleteAllHint')}</p>
        <Button
          variant="destructive"
          className="mt-3"
          loading={busy === 'wipe'}
          onClick={() => setWipeStep(1)}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t('settings.deleteAll')}
        </Button>
      </Card>

      {/* Διπλό confirm: πρώτο «τι θα γίνει», δεύτερο «είσαι σίγουρος». */}
      <ConfirmDialog
        open={wipeStep === 1}
        title={t('settings.deleteAllTitle1')}
        description={t('settings.deleteAllDesc1')}
        confirmLabel={t('settings.deleteAllContinue')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => setWipeStep(2)}
        onCancel={() => setWipeStep(0)}
      />
      <ConfirmDialog
        open={wipeStep === 2}
        title={t('settings.deleteAllTitle2')}
        description={t('settings.deleteAllDesc2')}
        confirmLabel={t('settings.deleteAllConfirm')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => void onWipe()}
        onCancel={() => setWipeStep(0)}
      />
    </div>
  );
}
