import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Check, Plus, Trash2, UserRound } from 'lucide-react';
import {
  createProfile,
  deleteProfile,
  getProfileStats,
  listProfiles,
  renameProfile,
} from '@/lib/db/queries';
import { getCurrentUserId, setCurrentUserId } from '@/lib/db/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/api/auth';
import { CrossLink, SettingsHeader } from '@/features/settings/components/SettingsList';

/**
 * Προφίλ σε ΑΥΤΗ τη συσκευή — /settings/profiles.
 *
 * Δεν είναι λογαριασμοί: δεν υπάρχει κωδικός. Η σύγχυση ήταν πραγματική —
 * «Προφίλ» και «Λογαριασμός» κάθονταν σε δύο διαφορετικά σημεία με σχεδόν
 * ίδιο όνομα. Εδώ το λέμε ρητά, δείχνουμε ΠΟΙΟ προφίλ συγχρονίζεται, και
 * δίνουμε σύνδεσμο προς το άλλο. Μια ψεύτικη αίσθηση ασφάλειας (ή sync)
 * είναι χειρότερη από καθόλου.
 */
export function ProfilePage() {
  const { t } = useTranslation();
  const activeId = getCurrentUserId();
  const auth = useAuth();

  const profiles = useLiveQuery(() => listProfiles(), [], []);
  const stats = useLiveQuery(
    async () =>
      Object.fromEntries(
        await Promise.all(
          (await listProfiles()).map(async (p) => [p.id, await getProfileStats(p.id)] as const),
        ),
      ),
    [],
    {} as Record<string, { workouts: number; prs: number; programs: number }>,
  );

  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const label = (p: { display_name: string | null; id: string }) =>
    p.display_name ?? t('profile.unnamed');

  const onCreate = async () => {
    if (!newName.trim() || busy) return;
    setBusy(true);
    try {
      const created = await createProfile(newName);
      setNewName('');
      // Μεταπηδάμε αμέσως στο νέο προφίλ — αυτό ήθελε ο χρήστης φτιάχνοντάς το.
      switchTo(created.id);
    } finally {
      setBusy(false);
    }
  };

  /**
   * Reload μετά την εναλλαγή: τα liveQueries παρακολουθούν πίνακες Dexie, όχι
   * τη μεταβλητή του session — χωρίς reload θα έδειχναν δεδομένα του παλιού
   * προφίλ μέχρι την επόμενη εγγραφή.
   */
  const switchTo = (id: string) => {
    setCurrentUserId(id);
    globalThis.location.reload();
  };

  const onDelete = async (id: string) => {
    if (busy) return;
    setBusy(true);
    try {
      await deleteProfile(id);
      setConfirmDelete(null);
      if (id === activeId) {
        const rest = (await listProfiles())[0];
        if (rest) switchTo(rest.id);
      }
    } finally {
      setBusy(false);
    }
  };

  const onRename = async (id: string) => {
    await renameProfile(id, editName);
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('profile.title')} description={t('profile.deviceOnly')} />

      <CrossLink to="/settings/account" label={t('profile.vsAccount')} />

      <section className="space-y-2">
        {profiles.map((p) => {
          const isActive = p.id === activeId;
          const s = stats[p.id];
          return (
            <div
              key={p.id}
              className={cn(
                // Flatten: μόνο το ενεργό προφίλ παίρνει περίγραμμα — αυτό
                // κουβαλά νόημα (επιλογή), δεν είναι διακοσμητικό.
                'rounded-lg bg-card p-3',
                isActive ? 'border border-primary' : 'border border-transparent',
              )}
            >
              {editingId === p.id ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-9"
                    aria-label={t('profile.name')}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void onRename(p.id);
                    }}
                  />
                  <Button size="sm" className="h-9" onClick={() => void onRename(p.id)}>
                    {t('common.save')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9"
                    onClick={() => setEditingId(null)}
                  >
                    {t('common.cancel')}
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-3">
                  <UserRound
                    className={cn(
                      'h-5 w-5 shrink-0',
                      isActive ? 'text-primary' : 'text-muted-foreground',
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-sm font-medium">
                      {label(p)}
                      {isActive && (
                        <span className="flex items-center gap-0.5 text-[10px] uppercase text-primary">
                          <Check className="h-3 w-3" aria-hidden />
                          {t('profile.active')}
                        </span>
                      )}
                      {isActive && auth && (
                        <span className="text-[10px] uppercase text-muted-foreground">
                          · {t('profile.syncedByAccount')}
                        </span>
                      )}
                    </p>
                    {s && (
                      <p className="font-mono text-xs text-muted-foreground">
                        {s.workouts} {t('profile.workouts')} · {s.prs} {t('profile.prs')}
                      </p>
                    )}
                  </div>
                  {!isActive && (
                    <Button size="sm" variant="ghost" onClick={() => switchTo(p.id)}>
                      {t('profile.switch')}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setEditingId(p.id);
                      setEditName(p.display_name ?? '');
                    }}
                  >
                    {t('common.edit')}
                  </Button>
                  {profiles.length > 1 && (
                    <Button
                      size="sm"
                      variant="ghost"
                      aria-label={t('profile.delete')}
                      onClick={() => setConfirmDelete(p.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              )}

              {confirmDelete === p.id && (
                <div className="mt-3 rounded-md border border-destructive/50 bg-destructive/10 p-3">
                  <p className="text-sm font-medium">{t('profile.deleteConfirmTitle')}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('profile.deleteConfirmDesc', {
                      workouts: s?.workouts ?? 0,
                      prs: s?.prs ?? 0,
                    })}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      disabled={busy}
                      onClick={() => void onDelete(p.id)}
                    >
                      {t('profile.delete')}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section className="rounded-lg bg-card p-4">
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('profile.newProfile')}
        </p>
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('profile.namePlaceholder')}
            className="h-9"
            aria-label={t('profile.name')}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void onCreate();
            }}
          />
          <Button
            size="sm"
            className="h-9 shrink-0"
            disabled={!newName.trim() || busy}
            onClick={() => void onCreate()}
          >
            <Plus className="h-4 w-4" />
            {t('profile.create')}
          </Button>
        </div>
      </section>

      <p className="text-xs text-muted-foreground">{t('profile.syncHint')}</p>
    </div>
  );
}
