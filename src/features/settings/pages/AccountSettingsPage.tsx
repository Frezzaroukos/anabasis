import { useTranslation } from 'react-i18next';
import { AccountCard } from '@/features/account/AccountCard';
import { CrossLink, SettingsHeader } from '../components/SettingsList';

/**
 * Ο λογαριασμός στο cloud — email, κωδικός, sync, αποσύνδεση.
 *
 * Ξεχωριστή σελίδα από τα «προφίλ συσκευής» επειδή είναι ΑΛΛΟ πράγμα, και
 * μέχρι τώρα τα δύο κάθονταν σε δύο σημεία με σχεδόν ίδιο όνομα. Η επεξήγηση
 * από πάνω και ο σύνδεσμος από κάτω λένε ρητά ποιο είναι ποιο.
 */
export function AccountSettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('settings.account')} description={t('settings.accountDesc')} />
      <AccountCard showTitle={false} />
      <CrossLink to="/settings/profiles" label={t('account.vsProfiles')} />
    </div>
  );
}
