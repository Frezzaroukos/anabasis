import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import {
  ApiError,
  changePassword,
  deleteAccount,
  login,
  logout,
  logoutOtherDevices,
  requestMagicLink,
  signup,
  UnsyncedChangesError,
  useAuth,
} from '@/lib/api/auth';
import { api, googleStart } from '@/lib/api/client';
import type { OAuthProviders } from '@/lib/api/types';
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
      <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function PasswordInput({
  label,
  value,
  onChange,
  autoComplete,
  minLength,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: string;
  minLength?: number;
}) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  return (
    <Field label={label}>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          required
          minLength={minLength}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="pr-10"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={t(visible ? 'account.hidePassword' : 'account.showPassword')}
          className="absolute right-1 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-elevated hover:text-foreground"
        >
          {visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </Field>
  );
}

/**
 * Κάρτα λογαριασμού & sync στις Ρυθμίσεις — server/API-CONTRACT.md.
 * Χωρίς λογαριασμό: login/signup. Με λογαριασμό: κατάσταση sync + logout.
 */
export function AccountCard({ showTitle = true }: { showTitle?: boolean } = {}) {
  const { t } = useTranslation();
  const auth = useAuth();

  // Μέσα στη σελίδα /settings/account ο τίτλος τον κουβαλά η επικεφαλίδα της
  // σελίδας — δύο φορές «Λογαριασμός» δεν προσθέτει τίποτα.
  if (!auth || !auth.account) return <SignedOutForm showTitle={showTitle} />;
  return (
    <SignedInPanel
      accountEmail={auth.account.email}
      role={auth.account.role}
      title={showTitle ? t('account.title') : null}
    />
  );
}

/**
 * GET /api/auth/oauth/providers — τα social κουμπιά (Google, magic-link) είναι
 * κρυμμένα μέχρι ο server να τα αναφέρει ενεργά (δηλ. μέχρι να οριστούν τα
 * αντίστοιχα env vars: ANABASIS_GOOGLE_* / ANABASIS_SMTP_*). Δίκτυο εκτός/
 * σφάλμα → σιωπηλά κρυμμένα, ΟΧΙ crash (ίδιο πνεύμα με το offline-tolerant sync).
 */
function useAuthProviders(): OAuthProviders {
  const [providers, setProviders] = useState<OAuthProviders>({ google: false, magic: false });

  useEffect(() => {
    let cancelled = false;
    api
      .oauthProviders()
      .then((p) => {
        if (!cancelled) setProviders(p);
      })
      .catch(() => {
        /* server εκτός/παλιό build χωρίς το endpoint — κρύψε τα κουμπιά */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return providers;
}

function SignedOutForm({ showTitle }: { showTitle: boolean }) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const providers = useAuthProviders();
  const [magicBusy, setMagicBusy] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  const onMagicLink = async () => {
    if (magicBusy) return;
    setErrorKey(null);
    if (!email.trim()) {
      setErrorKey('account.errorEmailRequired');
      return;
    }
    setMagicBusy(true);
    try {
      await requestMagicLink(email.trim());
      setMagicSent(true);
    } catch (err) {
      setErrorKey(errorKeyFor(err));
    } finally {
      setMagicBusy(false);
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setErrorKey(null);

    if (mode === 'signup' && password.length < 8) {
      setErrorKey('account.errorPasswordTooShort');
      return;
    }
    if (mode === 'signup' && password !== confirmPassword) {
      setErrorKey('account.errorPasswordMismatch');
      return;
    }

    setBusy(true);
    try {
      if (mode === 'signup') await signup(email.trim(), password);
      else await login(email.trim(), password);
      setPassword('');
      setConfirmPassword('');
    } catch (err) {
      setErrorKey(errorKeyFor(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="rounded-lg bg-card p-4">
      {showTitle && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('account.title')}
        </p>
      )}
      <div className="mb-3 flex gap-2">
        {(['login', 'signup'] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setConfirmPassword('');
              setErrorKey(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors tap:flex tap:min-h-11 tap:items-center tap:justify-center ${
              mode === m ? 'bg-primary text-primary-foreground' : 'bg-elevated hover:bg-accent'
            }`}
          >
            {t(m === 'login' ? 'account.login' : 'account.signup')}
          </button>
        ))}
      </div>

      {providers.google && (
        <Button
          type="button"
          variant="secondary"
          className="mb-3 w-full"
          onClick={() => {
            window.location.href = googleStart();
          }}
        >
          {t('account.continueWithGoogle')}
        </Button>
      )}

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
        <PasswordInput
          label={t('account.password')}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          // Το ≥8 ισχύει μόνο στο signup (server contract) — ένας υπάρχων
          // λογαριασμός δεν πρέπει να μπλοκάρεται στο login από HTML5
          // validation επειδή δοκιμάζει (σωστά ή λάθος) κάτι πιο κοντό.
          minLength={mode === 'signup' ? 8 : undefined}
          value={password}
          onChange={setPassword}
        />
        {mode === 'signup' && (
          <PasswordInput
            label={t('account.confirmPassword')}
            autoComplete="new-password"
            minLength={8}
            value={confirmPassword}
            onChange={setConfirmPassword}
          />
        )}

        {errorKey && (
          <p className="text-xs text-destructive" role="alert">
            {t(errorKey)}
          </p>
        )}

        <Button type="submit" disabled={busy} className="w-full">
          {busy ? t('common.loading') : t(mode === 'login' ? 'account.login' : 'account.signup')}
        </Button>
      </form>

      {mode === 'login' && providers.magic && !magicSent && (
        <button
          type="button"
          onClick={() => void onMagicLink()}
          disabled={magicBusy}
          className="mt-3 inline-flex min-h-11 items-center text-sm text-muted-foreground underline-offset-2 hover:underline disabled:opacity-60"
        >
          {t('account.forgotPassword')}
        </button>
      )}

      {providers.magic &&
        (magicSent ? (
          <p className="mt-3 rounded-md bg-elevated px-3 py-2 text-xs text-muted-foreground" role="status">
            {t('account.magicSent')}
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
              {t('account.moreOptions')}
            </h3>
            <Button
              type="button"
              variant="secondary"
              className="w-full"
              disabled={magicBusy}
              onClick={() => void onMagicLink()}
            >
              {magicBusy ? t('common.loading') : t('account.emailLink')}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              {t('account.emailLinkHint')}
            </p>
          </div>
        ))}

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
  title: string | null;
}) {
  const { t, i18n } = useTranslation();
  const sync = useSyncStatus();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showAdminCode, setShowAdminCode] = useState(false);
  const [adminCode, setAdminCode] = useState('');
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminStatusKey, setAdminStatusKey] = useState<string | null>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changeBusy, setChangeBusy] = useState(false);
  const [changeStatusKey, setChangeStatusKey] = useState<string | null>(null);
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutOthersBusy, setLogoutOthersBusy] = useState(false);
  const [logoutOthersStatusKey, setLogoutOthersStatusKey] = useState<string | null>(null);
  // >0 = υπάρχουν ασυγχρόνιστες αλλαγές· δείχνουμε «logout ούτως ή άλλως;».
  const [unsyncedPending, setUnsyncedPending] = useState(0);
  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteErrorKey, setDeleteErrorKey] = useState<string | null>(null);

  const onChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (changeBusy) return;
    if (newPassword.length < 8) {
      setChangeStatusKey('account.errorPasswordTooShort');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setChangeStatusKey('account.errorPasswordMismatch');
      return;
    }
    setChangeBusy(true);
    setChangeStatusKey(null);
    try {
      await changePassword(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setShowChangePassword(false);
      setChangeStatusKey('account.passwordChanged');
    } catch (err) {
      setChangeStatusKey(errorKeyFor(err));
    } finally {
      setChangeBusy(false);
    }
  };

  const onClaimAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminBusy(true);
    setAdminStatusKey(null);
    try {
      await api.claimAdmin(adminCode.trim());
      setAdminStatusKey('account.adminClaimed');
      setShowAdminCode(false);
      setAdminCode('');
    } catch (err) {
      setAdminStatusKey(
        err instanceof ApiError && err.code === 'bad_code'
          ? 'account.errorBadCode'
          : 'account.errorGeneric',
      );
    } finally {
      setAdminBusy(false);
    }
  };

  const onLogout = async (force = false) => {
    if (logoutBusy) return;
    setLogoutBusy(true);
    try {
      await logout({ force });
      setUnsyncedPending(0);
    } catch (err) {
      // Ασυγχρόνιστες αλλαγές: μην αποσυνδεθείς σιωπηλά — ρώτα τον χρήστη.
      if (err instanceof UnsyncedChangesError) setUnsyncedPending(err.pending);
      else throw err;
    } finally {
      setLogoutBusy(false);
    }
  };

  const onDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (deleteBusy || deleteConfirmation.trim().toLowerCase() !== accountEmail.toLowerCase()) return;
    setDeleteBusy(true);
    setDeleteErrorKey(null);
    try {
      await deleteAccount(deleteConfirmation.trim());
    } catch {
      setDeleteErrorKey('account.deleteError');
      setDeleteBusy(false);
    }
  };

  const onLogoutOthers = async () => {
    if (logoutOthersBusy) return;
    setLogoutOthersBusy(true);
    setLogoutOthersStatusKey(null);
    try {
      const revoked = await logoutOtherDevices();
      setLogoutOthersStatusKey(
        revoked > 0 ? 'account.logoutOthersDone' : 'account.logoutOthersNone',
      );
    } catch {
      setLogoutOthersStatusKey('account.logoutOthersError');
    } finally {
      setLogoutOthersBusy(false);
    }
  };

  const lastSyncLabel = sync.lastSyncAt
    ? new Date(sync.lastSyncAt).toLocaleString(i18n.resolvedLanguage)
    : t('account.syncNever');

  return (
    <section className="rounded-lg bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        {title && (
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {title}
          </p>
        )}
        {role === 'admin' && (
          <span className="ml-auto flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
            <ShieldCheck className="h-3 w-3" aria-hidden />
            {t('account.roleAdmin')}
          </span>
        )}
      </div>

      <p className="mt-2 font-mono text-sm text-muted-foreground">{accountEmail}</p>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3 text-sm">
        <div>
          <p>{t('account.syncStatus')}</p>
          <p className="mt-0.5 font-mono text-xs text-muted-foreground" role="status">
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
          className="mt-3 flex items-center justify-between rounded-md bg-elevated px-3 py-2 text-sm transition-colors hover:bg-accent"
        >
          <span>{t('account.adminLink')}</span>
          <span aria-hidden className="text-muted-foreground">→</span>
        </Link>
      )}

      {role !== 'admin' && (
        <div className="mt-3 border-t border-border/60 pt-3">
          <button
            type="button"
            onClick={() => setShowAdminCode((v) => !v)}
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            {t('account.adminCode')}
          </button>
          {showAdminCode && (
            <form onSubmit={(e) => void onClaimAdmin(e)} className="mt-3 flex gap-2">
              <Input
                type="password"
                autoComplete="off"
                required
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder={t('account.adminCodePlaceholder')}
                aria-label={t('account.adminCode')}
              />
              <Button type="submit" size="sm" disabled={adminBusy}>
                {adminBusy ? t('common.loading') : t('common.confirm')}
              </Button>
            </form>
          )}
          {adminStatusKey && (
            <p className="mt-2 text-xs text-muted-foreground" role="status">
              {t(adminStatusKey)}
            </p>
          )}
        </div>
      )}

      <div className="mt-3 border-t border-border/60 pt-3">
        <button
          type="button"
          onClick={() => setShowChangePassword((v) => !v)}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          {t('account.changePassword')}
        </button>

        {showChangePassword && (
          <form onSubmit={(e) => void onChangePassword(e)} className="mt-3 space-y-3">
            <PasswordInput
              label={t('account.currentPassword')}
              autoComplete="current-password"
              value={currentPassword}
              onChange={setCurrentPassword}
            />
            <PasswordInput
              label={t('account.newPassword')}
              autoComplete="new-password"
              minLength={8}
              value={newPassword}
              onChange={setNewPassword}
            />
            <PasswordInput
              label={t('account.confirmPassword')}
              autoComplete="new-password"
              minLength={8}
              value={confirmNewPassword}
              onChange={setConfirmNewPassword}
            />
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

      <div className="mt-3 space-y-2 border-t border-border/60 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="ghost" disabled={logoutBusy} onClick={() => void onLogout()}>
            {t('account.logout')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={logoutOthersBusy}
            onClick={() => void onLogoutOthers()}
          >
            {logoutOthersBusy ? t('common.loading') : t('account.logoutOthers')}
          </Button>
        </div>
        {logoutOthersStatusKey && (
          <p className="text-xs text-muted-foreground" role="status">
            {t(logoutOthersStatusKey)}
          </p>
        )}
        {unsyncedPending > 0 && (
          <div className="mt-2 rounded-md bg-destructive/10 p-2 text-xs" role="alert">
            <p className="text-destructive">
              {t('account.logoutUnsynced', { count: unsyncedPending })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={logoutBusy}
                onClick={() => setUnsyncedPending(0)}
              >
                {t('common.cancel')}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={logoutBusy}
                onClick={() => void onLogout(true)}
              >
                {t('account.logoutAnyway')}
              </Button>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-border/60 pt-3">
        <button
          type="button"
          onClick={() => setShowDelete((v) => !v)}
          className="text-sm text-destructive underline-offset-2 hover:underline"
        >
          {t('account.deleteAccount')}
        </button>
        {showDelete && (
          <form onSubmit={(e) => void onDeleteAccount(e)} className="mt-3 space-y-3">
            <p className="text-xs text-muted-foreground">{t('account.deleteWarning')}</p>
            <Field label={t('account.confirmEmail')}>
              <Input
                type="email"
                autoComplete="email"
                required
                value={deleteConfirmation}
                onChange={(e) => setDeleteConfirmation(e.target.value)}
              />
            </Field>
            {deleteErrorKey && <p className="text-xs text-destructive" role="alert">{t(deleteErrorKey)}</p>}
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={deleteBusy || deleteConfirmation.trim().toLowerCase() !== accountEmail.toLowerCase()}
            >
              {deleteBusy ? t('common.loading') : t('account.deleteForever')}
            </Button>
          </form>
        )}
      </div>
    </section>
  );
}
