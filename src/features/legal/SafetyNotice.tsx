import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hasSafetyAck, setSafetyAck } from '@/lib/safety';

/**
 * Λεπτή μπάρα με το health-disclaimer, για χρήστες που έκαναν onboarding ΠΡΙΝ
 * προστεθεί η σελίδα ασφάλειας (δεν έχουν ack bit). Νέοι χρήστες το βλέπουν
 * μέσα στο onboarding και το ack σφραγίζεται εκεί, οπότε δεν το ξαναβλέπουν.
 * Το ίδιο το κείμενο περιέχει τον πυρήνα του disclaimer — «Got it» = το είδα.
 */
export function SafetyNotice() {
  const { t } = useTranslation();
  const [acked, setAcked] = useState(hasSafetyAck);

  if (acked) return null;

  const dismiss = () => {
    setSafetyAck();
    setAcked(true);
  };

  return (
    <div
      role="region"
      aria-label={t('legal.safety.title')}
      className="mx-auto mb-4 flex w-full max-w-md items-start gap-3 rounded-xl bg-elevated p-3 text-left shadow-elevated md:max-w-4xl lg:max-w-5xl"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="text-xs leading-relaxed text-muted-foreground">{t('legal.safety.banner')}</p>
        {/* tap:min-h-11 δίνει 44px περιοχή αφής στα touch (τηλέφωνο + tablet)·
            στο desktop μένει συμπαγές banner. inline-flex ώστε το μεγαλύτερο
            ύψος αφής να μη σπρώχνει το κείμενο. */}
        <div className="mt-2 flex items-center gap-1">
          <Link
            to="/legal/safety"
            className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium text-primary hover:underline tap:min-h-11"
          >
            {t('legal.safety.readMore')}
          </Link>
          <Button variant="ghost" size="sm" className="px-3 text-xs tap:min-h-11" onClick={dismiss}>
            {t('legal.safety.gotIt')}
          </Button>
        </div>
      </div>
    </div>
  );
}
