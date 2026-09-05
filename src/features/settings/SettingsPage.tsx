import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  Activity,
  Cloud,
  Database,
  Download,
  Info,
  ListChecks,
  Palette,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react';
import { listProfiles } from '@/lib/db/queries';
import { getCurrentUserId } from '@/lib/db/session';
import { useAppSettings } from '@/hooks/useAppSettings';
import { useAuth } from '@/lib/api/auth';
import { getStoredTheme } from '@/lib/theme';
import { SettingsGroup, SettingsRow } from './components/SettingsList';

/**
 * Hub ρυθμίσεων.
 *
 * Ήταν μία στήλη με εννιά ανομοιόμορφες κάρτες: για να δεις αν υπάρχει
 * ρύθμιση για κάτι, έπρεπε να τη σκρολάρεις ολόκληρη. Τώρα είναι
 * περιεχόμενα — κάθε ομάδα δείχνει τι ρυθμίζεται ΚΑΙ πώς είναι ρυθμισμένο,
 * και το βάθος μπαίνει σε υποσελίδες.
 *
 * Η πρώτη ομάδα λύνει τη διπλή ταυτότητα: «Λογαριασμός» (cloud, email, sync)
 * και «Προφίλ συσκευής» (τοπικά σετ δεδομένων) στέκονται δίπλα-δίπλα με τις
 * τιμές τους, ώστε να φαίνεται με τη μία ότι είναι δύο διαφορετικά πράγματα.
 */
export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const auth = useAuth();
  const settings = useAppSettings();
  const activeId = getCurrentUserId();
  const profiles = useLiveQuery(() => listProfiles(), [], []);

  const activeProfile = profiles.find((p) => p.id === activeId);
  // `undefined` = δεν ξέρουμε ακόμα (φορτώνει) → καμία τιμή, ΟΧΙ ψεύτικο κενό.
  const profileValue =
    profiles.length === 0
      ? null
      : (activeProfile?.display_name ?? t('profile.unnamed')) +
        (profiles.length > 1 ? ` · ${profiles.length}` : '');

  const rest = settings?.default_rest_timer_seconds;
  const restLabel = rest == null ? null : rest < 60 ? `${rest}s` : `${rest / 60}m`;
  const unit = settings?.weight_unit;
  const trainingValue = [restLabel, unit ? t(`common.${unit}`) : null].filter(Boolean).join(' · ');

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold tracking-tight">{t('settings.title')}</h1>
      </header>

      <SettingsGroup title={t('settings.hubAccountGroup')}>
        <SettingsRow
          to="/settings/account"
          Icon={Cloud}
          label={t('settings.account')}
          value={auth?.account.email ?? t('settings.notSignedIn')}
        />
        <SettingsRow
          to="/settings/profiles"
          Icon={Users}
          label={t('settings.deviceProfiles')}
          value={profileValue}
        />
      </SettingsGroup>

      <SettingsGroup title={t('settings.hubAppGroup')}>
        <SettingsRow
          to="/settings/appearance"
          Icon={Palette}
          label={t('settings.appearance')}
          value={`${t(`settings.theme_${getStoredTheme()}`)} · ${(
            i18n.resolvedLanguage ?? 'en'
          ).toUpperCase()}`}
        />
        <SettingsRow
          to="/settings/training"
          Icon={Timer}
          label={t('settings.training')}
          value={trainingValue || null}
        />
      </SettingsGroup>

      {/* Η βιβλιοθήκη σου — οθόνες «στήσε το μια φορά», όχι καθημερινής χρήσης. */}
      <SettingsGroup title={t('settings.library')}>
        <SettingsRow to="/exercises" Icon={ListChecks} label={t('exercises.title')} />
        <SettingsRow to="/activities" Icon={Activity} label={t('activities.title')} />
        <SettingsRow to="/skills" Icon={Sparkles} label={t('skills.title')} />
      </SettingsGroup>

      <SettingsGroup title={t('settings.hubDataGroup')}>
        <SettingsRow to="/settings/data" Icon={Database} label={t('settings.data')} />
        <SettingsRow to="/import" Icon={Download} label={t('import.title')} />
      </SettingsGroup>

      <SettingsGroup title={t('settings.hubAboutGroup')}>
        <SettingsRow to="/settings/about" Icon={Info} label={t('settings.about')} />
      </SettingsGroup>

      <p className="text-center text-xs text-muted-foreground">
        Anabasis · {t('settings.offlineNote')}
      </p>
    </div>
  );
}
