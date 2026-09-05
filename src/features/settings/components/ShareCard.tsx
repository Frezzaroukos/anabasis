import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, ExternalLink, Share2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const APP_URL = 'https://anabasis.axonos.dev';
/** Δημιουργός — πραγματικοί σύνδεσμοι μόνο (no invented handles). */
const CREATOR = {
  name: 'Aggelos Frezzaroukos',
  links: [
    { label: 'portfolio.axonos.dev', href: 'https://portfolio.axonos.dev' },
    { label: 'github.com/Frezzaroukos', href: 'https://github.com/Frezzaroukos' },
  ],
};

/**
 * Μοιράσου το Anabasis: σύνδεσμος + native share (κινητό) + QR + credit στον
 * δημιουργό. Το QR είναι static asset του app URL — ίδιο για όλους, δουλεύει
 * offline. Λευκή κάρτα πίσω του ώστε να σκανάρεται και σε dark theme.
 */
export function ShareCard() {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(APP_URL);
      setCopied(true);
      globalThis.setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard denied — no-op, το link φαίνεται ούτως ή άλλως */
    }
  };
  const nativeShare = async () => {
    try {
      await navigator.share?.({ title: 'Anabasis', text: t('share.tagline'), url: APP_URL });
    } catch {
      /* cancelled / unsupported */
    }
  };
  const canNativeShare = typeof navigator !== 'undefined' && 'share' in navigator;

  return (
    <section className="rounded-xl bg-card p-4">
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
        {t('share.title')}
      </p>
      <p className="mb-3 text-sm text-muted-foreground">{t('share.tagline')}</p>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="shrink-0 self-center rounded-lg bg-white p-2.5">
          {/* QR στο app URL — public asset */}
          <img src="/share-qr.svg" alt={t('share.qrAlt')} width="128" height="128" className="block h-32 w-32" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <a
            href={APP_URL}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 truncate font-mono text-sm text-foreground hover:text-primary"
          >
            anabasis.axonos.dev
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
          </a>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-9 flex-1" onClick={() => void copy()}>
              {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
              {copied ? t('share.copied') : t('share.copy')}
            </Button>
            {canNativeShare && (
              <Button size="sm" className="h-9 flex-1" onClick={() => void nativeShare()}>
                <Share2 className="h-4 w-4" />
                {t('share.share')}
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{t('share.friendsHint')}</p>
        </div>
      </div>

      {/* Δημιουργός — job-anchor */}
      <div className="mt-4 border-t border-border/60 pt-3">
        <p className="text-sm">
          <span className="text-muted-foreground">{t('share.madeBy')} </span>
          <span className="font-medium">{CREATOR.name}</span>
        </p>
        <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {CREATOR.links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground hover:text-primary"
            >
              {l.label}
              <ExternalLink className="h-3 w-3" aria-hidden />
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
