import { useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Check, ShieldCheck } from 'lucide-react';
import { Card, SectionTitle } from '@/components/ui/Section';
import { Button } from '@/components/ui/button';
import { hasSafetyAck, setSafetyAck } from '@/lib/safety';

/** Τα νομικά/ασφάλειας έγγραφα που εκθέτουμε ως σελίδες. */
const DOCS = ['privacy', 'terms', 'safety'] as const;
type Doc = (typeof DOCS)[number];

interface Section {
  h: string;
  p: string;
}

/**
 * ΕΝΑ route (`/legal/:doc`) για Privacy / Terms / Safety. Το περιεχόμενο ζει
 * στο i18n (`legal.<doc>`, EN/EL) ώστε να είναι μεταφρασμένο και να μη
 * σκορπιστεί σε markup. Το Safety έχει επιπλέον κουμπί αποδοχής που σφραγίζει
 * το ack τοπικά — ίδιο bit με το onboarding, ώστε το banner να σωπάσει.
 */
export function LegalPage() {
  const { t } = useTranslation();
  const { doc } = useParams<{ doc: string }>();
  const [acked, setAcked] = useState(hasSafetyAck);

  if (!doc || !DOCS.includes(doc as Doc)) {
    return <Navigate to="/legal/privacy" replace />;
  }
  const kind = doc as Doc;

  // returnObjects: το κάθε έγγραφο = λίστα από {h, p}. Αν λείπει, [].
  const sections = t(`legal.${kind}.sections`, { returnObjects: true }) as Section[];
  const list = Array.isArray(sections) ? sections : [];

  const acceptSafety = () => {
    setSafetyAck();
    setAcked(true);
  };

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link
          to="/settings/about"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('legal.back')}
        </Link>
        <h1 className="font-display text-2xl font-semibold tracking-tight">
          {t(`legal.${kind}.title`)}
        </h1>
        <p className="text-xs text-muted-foreground">{t('legal.updated')}</p>
      </header>

      <Card>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {t(`legal.${kind}.intro`)}
        </p>
      </Card>

      {list.map((s, i) => (
        <Card key={i}>
          <SectionTitle>{s.h}</SectionTitle>
          <p className="-mt-2 text-sm leading-relaxed text-muted-foreground">{s.p}</p>
        </Card>
      ))}

      {kind === 'safety' && (
        <Card className="text-center">
          {acked ? (
            <p className="inline-flex items-center justify-center gap-2 text-sm text-primary">
              <ShieldCheck className="h-4 w-4" />
              {t('legal.safety.acked')}
            </p>
          ) : (
            <Button size="lg" className="w-full" onClick={acceptSafety}>
              <Check className="h-5 w-5" />
              {t('legal.safety.accept')}
            </Button>
          )}
        </Card>
      )}
    </div>
  );
}
