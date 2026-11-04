import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Check, KeyRound } from 'lucide-react';
import { api, ApiError } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/** Reads the reset token from the URL fragment and immediately removes it from
 * the address bar; fragments never reach access logs. */
function readResetToken(): string {
  if (typeof window === 'undefined') return '';
  const match = /(?:^#|&)reset=([^&]+)/.exec(window.location.hash);
  return match ? decodeURIComponent(match[1]!) : '';
}

export function PasswordResetPage() {
  const { t } = useTranslation();
  const token = useMemo(readResetToken, []);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) setError(t('resetPassword.invalid'));
    if (window.location.hash.includes('reset=')) {
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, [token, t]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !token) return;
    setError(null);
    if (password.length < 8) {
      setError(t('account.errorPasswordTooShort'));
      return;
    }
    if (password !== confirm) {
      setError(t('account.errorPasswordMismatch'));
      return;
    }
    setBusy(true);
    try {
      await api.passwordResetConsume(token, password);
      setDone(true);
      setPassword('');
      setConfirm('');
    } catch (err) {
      setError(
        err instanceof ApiError && err.code === 'invalid_reset'
          ? t('resetPassword.expired')
          : t('resetPassword.failed'),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-md space-y-6 py-6">
      <header className="text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
          <KeyRound className="h-6 w-6" aria-hidden />
        </div>
        <h1 className="mt-4 font-display text-2xl font-semibold tracking-tight">
          {t('resetPassword.title')}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('resetPassword.intro')}</p>
      </header>

      {done ? (
        <section className="rounded-xl bg-card p-5 text-center" role="status">
          <Check className="mx-auto h-8 w-8 text-[hsl(var(--gold))]" aria-hidden />
          <p className="mt-3 text-sm font-medium">{t('resetPassword.success')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('resetPassword.successHint')}</p>
          <Button asChild className="mt-4 w-full">
            <Link to="/settings/account">{t('resetPassword.backToSignIn')}</Link>
          </Button>
        </section>
      ) : (
        <form onSubmit={(e) => void submit(e)} className="space-y-4 rounded-xl bg-card p-5">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('account.newPassword')}</span>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy || !token}
            />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('account.confirmPassword')}</span>
            <Input
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              disabled={busy || !token}
            />
          </label>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
          <Button type="submit" className="w-full" loading={busy} disabled={!token}>
            {t('resetPassword.submit')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            <Link to="/settings/account" className="underline underline-offset-2">
              {t('resetPassword.backToSignIn')}
            </Link>
          </p>
        </form>
      )}
    </div>
  );
}
