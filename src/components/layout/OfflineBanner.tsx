import { useTranslation } from 'react-i18next';
import { CloudOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

/**
 * Διακριτικό banner που εμφανίζεται ΜΟΝΟ όταν ο browser είναι offline. Το
 * Anabasis είναι offline-first, οπότε δεν είναι σφάλμα — είναι καθησυχασμός:
 * η καταγραφή δουλεύει, ο συγχρονισμός περιμένει το δίκτυο. `role="status"`
 * + `aria-live="polite"` ώστε οι screen readers να το ανακοινώσουν χωρίς να
 * διακόψουν.
 */
export function OfflineBanner() {
  const { t } = useTranslation();
  const online = useOnlineStatus();

  if (online) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-in fade-in slide-in-from-top-2 flex items-start gap-3 rounded-lg border border-border bg-elevated px-4 py-3 text-sm duration-300"
    >
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-medium">{t('common.offline')}</p>
        <p className="text-muted-foreground">{t('common.offlineHint')}</p>
      </div>
    </div>
  );
}
