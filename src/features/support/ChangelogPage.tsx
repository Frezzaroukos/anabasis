import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/components/ui/Section';

interface Release {
  date: string;
  title: string;
  items: string[];
}

/**
 * «Τι νέο υπάρχει» — σύντομο changelog.
 *
 * Το περιεχόμενο ζει στο i18n (`changelog.releases`, EN/EL). Οι εγγραφές
 * αντιστοιχούν σε πραγματικά milestones που έχουν ήδη αποσταλεί — καμία
 * μελλοντική/φανταστική έκδοση (κανόνας: ποτέ fake data).
 */
export function ChangelogPage() {
  const { t } = useTranslation();
  const releases = t('changelog.releases', { returnObjects: true }) as Release[];
  const list = Array.isArray(releases) ? releases : [];

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          to="/settings"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground tap:min-h-11"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('changelog.back')}
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t('changelog.title')}
        </h1>
        <p className="text-sm leading-relaxed text-muted-foreground">{t('changelog.intro')}</p>
      </header>

      <ol className="space-y-4">
        {list.map((r, i) => (
          <li key={i}>
            <Card>
              <div className="mb-3 flex items-baseline justify-between gap-2">
                <h2 className="font-display text-base font-semibold tracking-tight">{r.title}</h2>
                <span className="shrink-0 text-xs font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {r.date}
                </span>
              </div>
              <ul className="space-y-1.5">
                {r.items.map((it, j) => (
                  <li
                    key={j}
                    className="flex gap-2 text-sm leading-relaxed text-muted-foreground"
                  >
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/60" aria-hidden />
                    <span className="min-w-0">{it}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </li>
        ))}
      </ol>
    </div>
  );
}
