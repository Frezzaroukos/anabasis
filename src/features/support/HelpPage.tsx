import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ChevronDown, HeartPulse, MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/Section';

interface Faq {
  q: string;
  a: string;
}

/**
 * Βοήθεια & Συχνές ερωτήσεις.
 *
 * Το περιεχόμενο ζει στο i18n (`help.*`, EN/EL) — καμία σκληροκωδικοποιημένη
 * πρόταση στο markup. Οι ερωτήσεις είναι native `<details>`: πλήρως
 * προσβάσιμες (πληκτρολόγιο + screen reader) και δουλεύουν χωρίς JS.
 */
export function HelpPage() {
  const { t } = useTranslation();
  const faqs = t('help.faq', { returnObjects: true }) as Faq[];
  const list = Array.isArray(faqs) ? faqs : [];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground tap:min-h-11"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('help.back')}
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('help.title')}</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('help.intro')}</p>
      </header>

      <div className="divide-y divide-border/50 overflow-hidden rounded-xl bg-card shadow-elevated">
        {list.map((f, i) => (
          <details key={i} className="group">
            <summary
              className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 text-sm font-medium tap:min-h-11 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <span className="min-w-0 flex-1">{f.q}</span>
              <ChevronDown
                className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>

      <Card className="space-y-3">
        <p className="text-sm text-muted-foreground">{t('help.stillStuck')}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Link
            to="/feedback"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-gradient-to-b from-primary to-primary/85 px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all hover:opacity-90 active:scale-[0.98] tap:min-h-11 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <MessageSquare className="h-4 w-4" />
            {t('help.contactCta')}
          </Link>
          <Link
            to="/legal/safety"
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-md bg-secondary px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-accent tap:min-h-11 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <HeartPulse className="h-4 w-4" />
            {t('help.legalCta')}
          </Link>
        </div>
      </Card>
    </div>
  );
}
