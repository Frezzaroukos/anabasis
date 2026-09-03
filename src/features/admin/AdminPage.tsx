import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/lib/api/auth';
import { api, ApiError, type AdminStats, type AdminUser } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { formatBytes, formatUptime } from './utils';

/**
 * /admin — server/API-CONTRACT.md "Admin" endpoints. Route wiring (lazy page
 * στο routes.tsx) ζει έξω από αυτό το lane· εδώ μόνο το guard.
 */
export function AdminPage() {
  const { t } = useTranslation();
  const auth = useAuth();

  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [confirmToggle, setConfirmToggle] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tempPasswordFor, setTempPasswordFor] = useState<{ id: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [toggleErrorKey, setToggleErrorKey] = useState<string | null>(null);

  const ADMIN_ERROR_KEY_BY_CODE: Record<string, string> = {
    self_disable: 'admin.errorSelfDisable',
    last_admin: 'admin.errorLastAdmin',
  };

  const isAdmin = auth?.account.role === 'admin';

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const [u, s] = await Promise.all([api.adminListUsers(), api.adminStats()]);
      setUsers(u);
      setStats(s);
    } catch {
      setLoadError(true);
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  // Hooks πάνω από εδώ, ΠΑΝΤΑ (rules-of-hooks) — το guard έρχεται μετά.
  if (!auth || auth.account.role !== 'admin') return <Navigate to="/" replace />;

  const onToggleDisabled = async (user: AdminUser) => {
    setBusyId(user.id);
    setToggleErrorKey(null);
    try {
      await api.adminSetDisabled(user.id, !user.disabled);
      await load();
    } catch (err) {
      // Ο πίνακας απλά δεν αλλάζει — καμία τοπική προσποίηση επιτυχίας.
      // self_disable/last_admin (server guards): μήνυμα ώστε ο admin να
      // ξέρει ΓΙΑΤΙ έμεινε ίδιο, όχι σιωπηλή αποτυχία.
      setToggleErrorKey(
        err instanceof ApiError ? (ADMIN_ERROR_KEY_BY_CODE[err.code] ?? 'admin.errorGeneric') : 'admin.errorGeneric',
      );
    } finally {
      setBusyId(null);
      setConfirmToggle(null);
    }
  };

  const onResetPassword = async (user: AdminUser) => {
    setBusyId(user.id);
    setTempPasswordFor(null);
    try {
      const res = await api.adminResetPassword(user.id);
      setTempPasswordFor({ id: user.id, password: res.temp_password });
    } catch {
      /* ο χρήστης ξαναδοκιμάζει */
    } finally {
      setBusyId(null);
    }
  };

  const onCopyTempPassword = () => {
    if (!tempPasswordFor) return;
    void navigator.clipboard?.writeText(tempPasswordFor.password);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('admin.title')}</h1>
      </header>

      {stats && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('admin.statAccounts')} value={stats.accounts} />
          <Stat label={t('admin.statRows')} value={stats.rows} />
          <Stat label={t('admin.statDbSize')} value={formatBytes(stats.db_size_bytes)} />
          <Stat label={t('admin.statUptime')} value={formatUptime(stats.uptime_seconds)} />
        </section>
      )}

      {loadError && <p className="text-sm text-destructive">{t('admin.loadError')}</p>}
      {toggleErrorKey && <p className="text-sm text-destructive" role="alert">{t(toggleErrorKey)}</p>}

      <section className="overflow-x-auto rounded-lg bg-card">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border/60 text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">{t('admin.colEmail')}</th>
              <th className="px-3 py-2">{t('admin.colRole')}</th>
              <th className="px-3 py-2">{t('admin.colCreated')}</th>
              <th className="px-3 py-2">{t('admin.colLastSync')}</th>
              <th className="px-3 py-2">{t('admin.colRows')}</th>
              <th className="px-3 py-2">{t('admin.colStatus')}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {(users ?? []).map((u) => (
              <tr key={u.id} className="border-b border-border/60 align-top last:border-0">
                <td className="px-3 py-2 font-mono">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {new Date(u.created_at).toLocaleDateString()}
                </td>
                <td className="px-3 py-2 font-mono text-muted-foreground">
                  {u.last_sync_at ? new Date(u.last_sync_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-3 py-2 font-mono">{u.row_count}</td>
                <td className="px-3 py-2">
                  {u.disabled ? t('admin.statusDisabled') : t('admin.statusActive')}
                </td>
                <td className="px-3 py-2">
                  <div className="flex justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === u.id}
                      onClick={() => setConfirmToggle(u)}
                    >
                      {u.disabled ? t('admin.enable') : t('admin.disable')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busyId === u.id}
                      onClick={() => void onResetPassword(u)}
                    >
                      {t('admin.resetPassword')}
                    </Button>
                  </div>
                  {tempPasswordFor?.id === u.id && (
                    <div className="mt-2 flex items-center justify-end gap-2 rounded-md bg-elevated px-2 py-1">
                      <code className="font-mono text-xs">{tempPasswordFor.password}</code>
                      <button
                        type="button"
                        className="text-xs text-primary underline-offset-2 hover:underline"
                        onClick={onCopyTempPassword}
                      >
                        {copied ? t('admin.copied') : t('admin.copy')}
                      </button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <ConfirmDialog
        open={confirmToggle != null}
        title={confirmToggle?.disabled ? t('admin.enableConfirmTitle') : t('admin.disableConfirmTitle')}
        description={confirmToggle?.email}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        destructive={!confirmToggle?.disabled}
        onConfirm={() => {
          if (confirmToggle) void onToggleDisabled(confirmToggle);
        }}
        onCancel={() => setConfirmToggle(null)}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-card p-3">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-display text-xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
