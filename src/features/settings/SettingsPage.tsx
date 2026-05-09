import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, LOCAL_USER_ID } from '@/lib/db';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const settings = useLiveQuery(
    () => db.app_settings.where('user_id').equals(LOCAL_USER_ID).first(),
    [],
  );

  const onLangChange = (lang: 'en' | 'el') => {
    void i18n.changeLanguage(lang);
    void db.users.update(LOCAL_USER_ID, {
      language: lang,
      updated_at: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('settings.title')}
        </h1>
      </header>

      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">{t('settings.language')}</p>
        <div className="flex gap-2">
          {(['en', 'el'] as const).map((lng) => (
            <button
              key={lng}
              onClick={() => onLangChange(lng)}
              className={`rounded-md border border-border px-3 py-1.5 text-sm transition-colors ${
                i18n.resolvedLanguage === lng
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 text-sm">
        <p className="mb-2 font-medium">{t('settings.restTimer')}</p>
        <p className="text-muted-foreground">
          {settings?.default_rest_timer_seconds ?? 180}s
        </p>
      </section>
    </div>
  );
}
