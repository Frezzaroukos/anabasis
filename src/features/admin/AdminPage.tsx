import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, Copy, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/api/auth';
import {
  api,
  ApiError,
  type AdminStats,
  type AdminTableBreakdown,
  type AdminUser,
} from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Card } from '@/components/ui/Section';
import { cn } from '@/lib/utils';
import { filterUsers, formatBytes, formatUptime, type AdminFilter } from './utils';

/** Server error code → i18n key (server/API-CONTRACT.md). */
const ERROR_KEY_BY_CODE: Record<string, string> = {
  self_disable: 'admin.errorSelfDisable',
  last_admin: 'admin.errorLastAdmin',
};

const FILTERS: AdminFilter[] = ['all', 'active', 'disabled', 'admins'];

type LoadState = 'loading' | 'ready' | 'error';

/**
 * /admin — server/API-CONTRACT.md «Admin».
 *
 * Ήταν ένας πίνακας 7 στηλών σε `overflow-x-auto` που, όσο φόρτωνε ή όταν
 * αποτύγχανε, έδειχνε ΚΕΝΟ: `{(users ?? []).map(...)}` δεν ξεχωρίζει το
 * «φορτώνει» από το «δεν υπάρχει κανείς». Τώρα κάθε κατάσταση λέει τι
 * συμβαίνει, και η λίστα είναι κάρτες — διαβάζονται και στο κινητό, από όπου
 * θα κοιτάς όταν σου γράψει κάποιος ότι δεν μπορεί να μπει.
 */
export function AdminPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();

  const [state, setState] = useState<LoadState>('loading');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<AdminFilter>('all');
  const [confirmToggle, setConfirmToggle] = useState<AdminUser | null>(null);
  const [confirmReset, setConfirmReset] = useState<AdminUser | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<{ id: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [actionErrorKey, setActionErrorKey] = useState<string | null>(null);

  const isAdmin = auth?.account.role === 'admin';

  const load = useCallback(async () => {
    setState('loading');
    try {
      const [u, s] = await Promise.all([api.adminListUsers(), api.adminStats()]);
      setUsers(u);
      setStats(s);
      setState('ready');
    } catch {
      setState('error');
    }
  }, []);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const shown = useMemo(() => filterUsers(users, query, filter), [users, query, filter]);

  // Hooks πάνω από εδώ, ΠΑΝΤΑ (rules-of-hooks) — το guard έρχεται μετά.
  if (!auth || auth.account.role !== 'admin') return <Navigate to="/" replace />;

  const onToggleDisabled = async (user: AdminUser) => {
    setBusyId(user.id);
    setActionErrorKey(null);
    try {
      await api.adminSetDisabled(user.id, !user.disabled);
      await load();
    } catch (err) {
      // Ο πίνακας απλά δεν αλλάζει — καμία τοπική προσποίηση επιτυχίας.
      // self_disable/last_admin (server guards): μήνυμα ώστε ο admin να ξέρει
      // ΓΙΑΤΙ έμεινε ίδιο, όχι σιωπηλή αποτυχία.
      setActionErrorKey(
        err instanceof ApiError
          ? (ERROR_KEY_BY_CODE[err.code] ?? 'admin.errorGeneric')
          : 'admin.errorGeneric',
      );
    } finally {
      setBusyId(null);
      setConfirmToggle(null);
    }
  };

  const onResetPassword = async (user: AdminUser) => {
    setBusyId(user.id);
    setActionErrorKey(null);
    setTempPassword(null);
    try {
      const res = await api.adminResetPassword(user.id);
      setTempPassword({ id: user.id, password: res.temp_password });
    } catch {
      setActionErrorKey('admin.resetError');
    } finally {
      setBusyId(null);
      setConfirmReset(null);
    }
  };

  const onCopy = () => {
    if (!tempPassword) return;
    void navigator.clipboard?.writeText(tempPassword.password);
    setCopied(true);
    globalThis.setTimeout(() => setCopied(false), 2000);
  };

  const filtering = query.trim() !== '' || filter !== 'all';

  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">{t('admin.title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('admin.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label={t('admin.refresh')}
          disabled={state === 'loading'}
          onClick={() => void load()}
        >
          <RefreshCw className={cn('h-4 w-4', state === 'loading' && 'animate-spin')} />
        </Button>
      </header>

      <StatsPanel state={state} stats={stats} />

      {state === 'error' && (
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-destructive" role="alert">
            {t('admin.loadError')}
          </p>
          <Button variant="outline" onClick={() => void load()}>
            {t('common.retry')}
          </Button>
        </Card>
      )}

      {actionErrorKey && (
        <p className="text-sm text-destructive" role="alert">
          {t(actionErrorKey)}
        </p>
      )}

      {state !== 'error' && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('admin.usersHeading')}
            </h2>
            {state === 'ready' && (
              <span className="font-mono text-xs tabular-nums text-muted-foreground">
                {t('admin.showingCount', { shown: shown.length, total: users.length })}
              </span>
            )}
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('admin.searchPlaceholder')}
              aria-label={t('admin.searchPlaceholder')}
              className="h-11 pl-9"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                className={cn(
                  'h-9 rounded-full px-3 text-xs font-medium transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filter === f
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-elevated text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                {t(`admin.filter${f[0]!.toUpperCase()}${f.slice(1)}`)}
              </button>
            ))}
          </div>

          {state === 'loading' && <UserSkeleton />}

          {state === 'ready' && shown.length === 0 && (
            <Card className="text-center">
              <p className="text-sm text-muted-foreground">
                {users.length === 0 ? t('admin.noUsers') : t('admin.noResults')}
              </p>
              {filtering && users.length > 0 && (
                <Button
                  variant="outline"
                  className="mt-3"
                  onClick={() => {
                    setQuery('');
                    setFilter('all');
                  }}
                >
                  {t('admin.clearFilters')}
                </Button>
              )}
            </Card>
          )}

          {state === 'ready' &&
            shown.map((u) => (
              <UserCard
                key={u.id}
                user={u}
                isSelf={u.id === auth.account.id}
                busy={busyId === u.id}
                locale={i18n.resolvedLanguage}
                tempPassword={tempPassword?.id === u.id ? tempPassword.password : null}
                copied={copied}
                onCopy={onCopy}
                onDismissPassword={() => setTempPassword(null)}
                onToggle={() => setConfirmToggle(u)}
                onReset={() => setConfirmReset(u)}
              />
            ))}
        </section>
      )}

      <ConfirmDialog
        open={confirmToggle != null}
        title={
          confirmToggle?.disabled ? t('admin.enableConfirmTitle') : t('admin.disableConfirmTitle')
        }
        description={`${confirmToggle?.email ?? ''} — ${
          confirmToggle?.disabled ? t('admin.enableConfirmDesc') : t('admin.disableConfirmDesc')
        }`}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        destructive={!confirmToggle?.disabled}
        onConfirm={() => {
          if (confirmToggle) void onToggleDisabled(confirmToggle);
        }}
        onCancel={() => setConfirmToggle(null)}
      />

      <ConfirmDialog
        open={confirmReset != null}
        title={t('admin.resetConfirmTitle')}
        description={`${confirmReset?.email ?? ''} — ${t('admin.resetConfirmDesc')}`}
        confirmLabel={t('common.confirm')}
        cancelLabel={t('common.cancel')}
        destructive
        onConfirm={() => {
          if (confirmReset) void onResetPassword(confirmReset);
        }}
        onCancel={() => setConfirmReset(null)}
      />
    </div>
  );
}

function StatsPanel({ state, stats }: { state: LoadState; stats: AdminStats | null }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage;
  const num = (n: number) => n.toLocaleString(locale);

  if (state === 'loading' && !stats) {
    return (
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-[4.75rem] animate-pulse rounded-xl bg-card" />
        ))}
      </section>
    );
  }
  if (!stats) return null;

  return (
    <section className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      <StatTile
        label={t('admin.statAccounts')}
        value={num(stats.accounts)}
        hint={t('admin.accountsHint', {
          active: num(stats.active_accounts),
          disabled: num(stats.disabled_accounts),
        })}
      />
      <StatTile label={t('admin.statAdmins')} value={num(stats.admins)} />
      <StatTile label={t('admin.statSessions')} value={num(stats.sessions)} />
      <StatTile label={t('admin.statRows')} value={num(stats.rows)} />
      {/* db_size_bytes είναι nullable: ο server γυρνά null όταν δεν διαβάζεται
          το αρχείο. «—» αντί για «0 B», που θα ήταν ψέμα. */}
      <StatTile
        label={t('admin.statDbSize')}
        value={stats.db_size_bytes == null ? null : formatBytes(stats.db_size_bytes)}
      />
      <StatTile label={t('admin.statUptime')} value={formatUptime(stats.uptime_seconds)} />
    </section>
  );
}

function StatTile({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="rounded-xl bg-card p-3 shadow-elevated">
      <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-xl tabular-nums">{value ?? '—'}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function UserSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="h-32 animate-pulse rounded-xl bg-card" />
      ))}
    </div>
  );
}

function UserCard({
  user,
  isSelf,
  busy,
  locale,
  tempPassword,
  copied,
  onCopy,
  onDismissPassword,
  onToggle,
  onReset,
}: {
  user: AdminUser;
  isSelf: boolean;
  busy: boolean;
  locale: string | undefined;
  tempPassword: string | null;
  copied: boolean;
  onCopy: () => void;
  onDismissPassword: () => void;
  onToggle: () => void;
  onReset: () => void;
}) {
  const { t } = useTranslation();
  const [showRows, setShowRows] = useState(false);

  const date = (iso: string) => new Date(iso).toLocaleDateString(locale, { dateStyle: 'medium' });
  const dateTime = (iso: string) =>
    new Date(iso).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <Card className={cn(user.disabled && 'opacity-70')}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-sm">{user.email}</p>
        {user.role === 'admin' && (
          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            {t('admin.roleAdmin')}
          </span>
        )}
        {isSelf && (
          <span className="rounded-full bg-elevated px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t('admin.you')}
          </span>
        )}
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            user.disabled ? 'bg-destructive/15 text-destructive' : 'bg-elevated text-muted-foreground',
          )}
        >
          {user.disabled ? t('admin.statusDisabled') : t('admin.statusActive')}
        </span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Field label={t('admin.colCreated')} value={date(user.created_at)} />
        {/* Ποτέ συγχρονισμένος ≠ συγχρονισμένος τώρα — «—», όχι σημερινή ημερομηνία. */}
        <Field
          label={t('admin.colLastSync')}
          value={user.last_sync_at ? dateTime(user.last_sync_at) : null}
        />
        <Field label={t('admin.colRows')} value={user.row_count.toLocaleString(locale)} />
        <Field label={t('admin.colSessions')} value={String(user.sessions)} />
      </dl>

      <div className="mt-4 flex flex-wrap gap-2">
        {/* Ο server απορρίπτει το self-disable (guard). Ένα κουμπί που πάντα
            αποτυγχάνει είναι θόρυβος — δεν το προσφέρουμε καθόλου. */}
        {!isSelf && (
          <Button variant="outline" disabled={busy} onClick={onToggle}>
            {user.disabled ? t('admin.enable') : t('admin.disable')}
          </Button>
        )}
        <Button variant="ghost" disabled={busy} onClick={onReset}>
          {t('admin.resetPassword')}
        </Button>
        <Button
          variant="ghost"
          aria-expanded={showRows}
          onClick={() => setShowRows((v) => !v)}
        >
          {showRows ? t('admin.hideRows') : t('admin.showRows')}
        </Button>
      </div>

      {tempPassword && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-primary">
            {t('admin.tempPasswordTitle')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{t('admin.tempPasswordWarning')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-md bg-elevated px-2 py-1.5 font-mono text-sm">
              {tempPassword}
            </code>
            <Button size="sm" variant="outline" className="h-11" onClick={onCopy}>
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              {copied ? t('admin.copied') : t('admin.copy')}
            </Button>
            <Button size="sm" variant="ghost" className="h-11" onClick={onDismissPassword}>
              {t('admin.dismiss')}
            </Button>
          </div>
        </div>
      )}

      {showRows && <RowBreakdown userId={user.id} locale={locale} />}
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="rounded-md bg-elevated px-2.5 py-2">
      <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      {/* null = δεν υπάρχει τιμή. «—», ποτέ ψεύτικο μηδέν/σημερινή ώρα. */}
      <dd className="mt-0.5 truncate font-mono text-xs tabular-nums">{value ?? '—'}</dd>
    </div>
  );
}

/**
 * Ανάλυση sync_rows ανά πίνακα — lazy: φορτώνει μόνο όταν ο admin την ανοίξει,
 * ώστε μια λίστα με δεκάδες χρήστες να μη χτυπά ένα request ανά κάρτα.
 */
function RowBreakdown({ userId, locale }: { userId: string; locale: string | undefined }) {
  const { t } = useTranslation();
  const [state, setState] = useState<LoadState>('loading');
  const [rows, setRows] = useState<AdminTableBreakdown[]>([]);

  useEffect(() => {
    let cancelled = false;
    setState('loading');
    api
      .adminUserRows(userId)
      .then((r) => {
        if (cancelled) return;
        setRows(r);
        setState('ready');
      })
      .catch(() => {
        if (!cancelled) setState('error');
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  if (state === 'loading') {
    return <div className="mt-3 h-24 animate-pulse rounded-lg bg-elevated" aria-hidden />;
  }
  if (state === 'error') {
    return (
      <p className="mt-3 text-xs text-destructive" role="alert">
        {t('admin.rowsError')}
      </p>
    );
  }
  if (rows.length === 0) {
    return <p className="mt-3 text-xs text-muted-foreground">{t('admin.rowsEmpty')}</p>;
  }

  return (
    <div className="mt-3 overflow-hidden rounded-lg bg-elevated">
      <table className="w-full text-left text-xs">
        <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 font-medium">{t('admin.colTable')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('admin.colRows')}</th>
            <th className="px-3 py-2 text-right font-medium">{t('admin.colDeleted')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.tbl} className="border-t border-border/40">
              <td className="px-3 py-1.5 font-mono">{r.tbl}</td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums">
                {r.row_count.toLocaleString(locale)}
              </td>
              <td className="px-3 py-1.5 text-right font-mono tabular-nums text-muted-foreground">
                {r.deleted_count.toLocaleString(locale)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
