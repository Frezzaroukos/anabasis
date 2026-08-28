import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ApiError,
  changePassword,
  login,
  logout,
  signup,
  useAuth,
} from '@/lib/api/auth';
import { syncNow, useSyncStatus } from '@/lib/sync';

/** Server error code → i18n key (server/API-CONTRACT.md). Άγνωστος κωδικός
 * ή network failure πέφτουν σε γενικό μήνυμα, όχι crash. */
const ERROR_KEY_BY_CODE: Record<string, string> = {
  email_taken: 'account.errorEmailTaken',
  bad_credentials: 'account.errorBadCredentials',
  locked: 'account.errorLocked',
  disabled: 'account.errorDisabled',
};

function errorKeyFor(err: unknown): string {
  if (err instanceof ApiError) return ERROR_KEY_BY_CODE[err.code] ?? 'account.errorGeneric';
  return 'account.errorNetwork';
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn('flex flex-col gap-1.5', className)}>
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

/**
 * Κάρτα λογαριασμού & sync στις Ρυθμίσεις — server/API-CONTRACT.md.
 * Χωρίς λογαριασμό: login/signup. Με λογαριασμό: κατάσταση sync + logout.
 */
export function AccountCard() {
  const { t } = useTranslation();
  const auth = useAuth();

  if (!auth) return <SignedOutForm />;
  return <SignedInPanel accountEmail={auth.account.email} role={auth.account.role} title={t('account.title')} />;
}

function SignedOutForm() {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorKey(null);

    if (mode === 'signup' && password.length < 8) {
      setErrorKey('account.errorPasswordTooShort');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') await signup(email.trim(), password);
      else await login(email.trim(), password);
      setPassword('');
    } catch (err) {
      setErrorKey(errorKeyFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <p className="mb-3 text-sm font-medium">{t('account.title')}</p>
      <div className="mb-3 flex gap-2">
        {(['login', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErrorKey(null);
            }}
            className={`flex-1 rounded-md border border-border px-3 py-1.5 text-sm transition-colors ${
              mode === m ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
            }`}
          >
            {t(m === 'login' ? 'account.login' : 'account.signup')}
          </button>
        ))}
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-3">
        <Field label={t('account.email')}>
          <Input
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('account.password')}>
          <Input
            type="password"
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            required
            // Το ≥8 ισχύει μόνο στο signup (server contract) — ένας υπάρχων
            // λογαριασμός δεν πρέπει να μπλοκάρεται στο login από HTML5
            // validation επειδή δοκιμάζει (σωστά ή λάθος) κάτι πιο κοντό.
            minLength={mode === 'signup' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>

        {errorKey && (
          <p className="text-xs text-destructive" role="alert">
            {t(errorKey)}
          </p>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t('common.loading') : t(mode === 'login' ? 'account.login' : 'account.signup')}
        </Button>
      </form>

      <p className="mt-3 text-xs text-muted-foreground">{t('account.hint')}</p>
    </section>
  );
}

function SignedInPanel({
  accountEmail,
  role,
  title,
}: {
  accountEmail: string;
  role: 'user' | 'admin';
  title: string;
}) {
  const { t, i18n } = useTranslation();
  const sync = useSyncStatus();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeStatusKey, setChangeStatusKey] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changeBusy) return;
    if (newPassword.length < 8) {
      setChangeStatusKey('account.errorPasswordTooShort');
      return;
    }
    setChangeBusy(true);
    setChangeStatusKey(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setShowChangePassword(false);
      setChangeStatusKey('account.passwordChanged');
    } catch (err) {
      setChangeStatusKey(errorKeyFor(err));
    } finally {
      setChangeBusy(false);
    }
  };

  const onLogout = async () => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await logout();
    } finally {
      setLogoutBusy(false);
    }
  };

  const lastSyncLabel = sync.lastSyncAt
    ? new Date(sync.lastSyncAt).toLocaleString(i18n.resolvedLanguage)
    : t('account.syncNever');

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        {role === 'admin' && (
          <span className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            {t('account.roleAdmin')}
          </span>
        )}
      </div>

      <p className="mt-2 text-sm text-muted-foreground">{accountEmail}</p>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3 text-sm">
        <div>
          <p>{t('account.syncStatus')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground" role="status">
            {t(`account.syncState_${sync.state}`)} · {lastSyncLabel}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={sync.state === 'syncing'}
          onClick={() => void syncNow()}
        >
          {t('account.syncNow')}
        </Button>
      </div>

      {role === 'admin' && (
        <Link
          to="/admin"
          className="mt-3 flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
        >
          <span>{t('account.adminLink')}</span>
          <span aria-hidden className="text-muted-foreground">→</span>
        </Link>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <button
          type="button"
          onClick={() => setShowChangePassword((v) => !v)}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {t('account.changePassword')}
        </button>

        {showChangePassword && (
          <form onSubmit={(e) => void onChangePassword(e)} className="mt-3 space-y-3">
            <Field label={t('account.currentPassword')}>
              <Input
                type="password"
                autoComplete="current-password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </Field>
            <Field label={t('account.newPassword')}>
              <Input
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </Field>
            <Button type="submit" size="sm" disabled={changeBusy}>
              {changeBusy ? t('common.loading') : t('common.save')}
            </Button>
          </form>
        )}

        {changeStatusKey && (
          <p className="mt-2 text-xs text-muted-foreground" role="status">
            {t(changeStatusKey)}
          </p>
        )}
      </div>

      <div className="mt-3 border-t border-border pt-3">
        <Button size="sm" variant="ghost" disabled={logoutBusy} onClick={() => void onLogout()}>
          {t('account.logout')}
        </Button>
      </div>
    </section>
  );
}
