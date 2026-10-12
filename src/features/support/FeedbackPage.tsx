import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, Copy, Mail } from 'lucide-react';
import { Card } from '@/components/ui/Section';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const CONTACT = 'contact@axonos.dev';
const TYPES = ['bug', 'idea', 'question', 'other'] as const;
type FeedbackType = (typeof TYPES)[number];

/**
 * Φόρμα feedback → contact@axonos.dev.
 *
 * Δεν υπάρχει (ακόμη) backend endpoint για feedback, και το app είναι
 * offline-first — οπότε αντί να ισχυριστούμε ψεύτικο «στάλθηκε», η φόρμα
 * ανοίγει τον mail client του χρήστη με όλα προσυμπληρωμένα. Τίποτα δεν
 * φεύγει μέχρι ο χρήστης να πατήσει «αποστολή» εκεί — τίμιο και δουλεύει
 * παντού (κανόνας: ποτέ fake success).
 */
export function FeedbackPage() {
  const { t } = useTranslation();
  const [type, setType] = useState<FeedbackType>('bug');
  const [message, setMessage] = useState('');
  const [includeDevice, setIncludeDevice] = useState(true);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const deviceInfo = () =>
    [
      `App: ${location.origin}`,
      `Language: ${navigator.language}`,
      `Screen: ${window.screen.width}×${window.screen.height}`,
      `Viewport: ${window.innerWidth}×${window.innerHeight}`,
      `Online: ${navigator.onLine ? 'yes' : 'no'}`,
      `Browser: ${navigator.userAgent}`,
    ].join('\n');

  const openEmail = () => {
    if (message.trim() === '') {
      setError(true);
      return;
    }
    const subject = `[Anabasis] ${t(`feedback.types.${type}`)}`;
    const body = includeDevice
      ? `${message}\n\n—\n${t('feedback.deviceInfoTitle')}:\n${deviceInfo()}`
      : message;
    window.location.href = `mailto:${CONTACT}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
  };

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard μπορεί να μην είναι διαθέσιμο — ο σύνδεσμος mailto παραμένει */
    }
  };

  const inputBase =
    'w-full rounded-md border border-transparent bg-elevated px-3 py-2 text-base sm:text-sm text-foreground transition-colors hover:border-border/70 focus-visible:border-ring/40 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background';

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground tap:min-h-11"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('feedback.back')}
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('feedback.title')}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('feedback.intro')}</p>
      </header>

      <Card className="space-y-5">
        <fieldset>
          <legend className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            {t('feedback.typeLabel')}
          </legend>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {TYPES.map((ty) => {
              const active = type === ty;
              return (
                <button
                  key={ty}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setType(ty)}
                  className={cn(
                    'rounded-md px-3 py-2 text-sm font-medium transition-colors tap:min-h-11 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                    active
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-elevated text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t(`feedback.types.${ty}`)}
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="space-y-2">
          <label htmlFor="feedback-message" className="block text-sm font-medium">
            {t('feedback.messageLabel')}
          </label>
          <textarea
            id="feedback-message"
            rows={5}
            value={message}
            onChange={(e) => {
              setMessage(e.target.value);
              if (error) setError(false);
            }}
            placeholder={t('feedback.messagePlaceholder')}
            className={cn(inputBase, 'resize-y leading-relaxed')}
            aria-invalid={error}
            aria-describedby={error ? 'feedback-error' : undefined}
          />
          {error && (
            <p id="feedback-error" className="text-xs text-destructive">
              {t('feedback.emptyError')}
            </p>
          )}
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={includeDevice}
            onChange={(e) => setIncludeDevice(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
          />
          <span>{t('feedback.includeDevice')}</span>
        </label>

        <Button size="lg" className="w-full" onClick={openEmail}>
          <Mail className="h-5 w-5" />
          {t('feedback.send')}
        </Button>
      </Card>

      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('feedback.fallbackNote')}
        </p>
        <button
          type="button"
          onClick={copyEmail}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-elevated px-3 py-2 text-xs font-medium text-foreground transition-colors hover:bg-accent tap:min-h-11 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
          {copied ? t('feedback.copied') : t('feedback.copyEmail')}
        </button>
      </Card>

      <p className="text-center text-xs text-muted-foreground">{CONTACT}</p>
    </div>
  );
}
