import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Monitor, Moon, Sun } from 'lucide-react';
import { db } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import { updateSettings } from '@/lib/db/queries';
import { Card, SectionTitle } from '@/components/ui/Section';
import {
  ACCENTS,
  getStoredAccent,
  getStoredCustomAccent,
  getStoredTheme,
  setAccent,
  setCustomAccent,
  setTheme,
  type Theme,
} from '@/lib/theme';
import { SettingsHeader } from '../components/SettingsList';
import { DashboardLayoutSettings } from '../components/DashboardLayoutSettings';

/** Πώς δείχνει το app: θέμα, χρώμα, γλώσσα, τι έχει η Αρχική. */
export function AppearanceSettingsPage() {
  const { t, i18n } = useTranslation();
  const [theme, setThemeState] = useState<Theme>(getStoredTheme());
  const [accent, setAccentState] = useState<string>(getStoredAccent());
  const [customHex, setCustomHex] = useState<string | null>(getStoredCustomAccent());

  const onLangChange = (lang: 'en' | 'el') => {
    void i18n.changeLanguage(lang);
    void db.users.update(getCurrentUserId(), {
      language: lang,
      updated_at: new Date().toISOString(),
    });
  };

  return (
    <div className="space-y-6">
      <SettingsHeader title={t('settings.appearance')} description={t('settings.appearanceDesc')} />

      <Card>
        <SectionTitle>{t('settings.theme')}</SectionTitle>
        <div className="flex gap-2">
          {(['dark', 'light', 'auto'] as const).map((th) => {
            const Icon = th === 'dark' ? Moon : th === 'light' ? Sun : Monitor;
            return (
              <button
                key={th}
                onClick={() => {
                  setTheme(th);
                  setThemeState(th);
                  void updateSettings({ theme: th });
                }}
                aria-pressed={theme === th}
                className={`flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm transition-colors ${
                  theme === th ? 'bg-primary text-primary-foreground' : 'bg-elevated hover:bg-accent'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(`settings.theme_${th}`)}
              </button>
            );
          })}
        </div>

        {/* Accent — το κύριο χρώμα του app. Το χρυσό των ρεκόρ μένει σταθερό. */}
        <p className="mb-2 mt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          {t('settings.accent')}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {ACCENTS.map((a) => (
            <button
              key={a.key}
              onClick={() => {
                setAccent(a.key);
                setAccentState(a.key);
              }}
              aria-label={a.label}
              aria-pressed={accent === a.key}
              title={a.label}
              className={`h-10 w-10 rounded-full border-2 transition-transform active:scale-90 ${
                accent === a.key ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ background: a.swatch }}
            />
          ))}
          {/* Custom: native color picker — ό,τι χρώμα θέλει ο χρήστης. */}
          <label
            title={t('settings.customAccent')}
            className={`relative h-10 w-10 cursor-pointer overflow-hidden rounded-full border-2 transition-transform active:scale-90 ${
              accent === 'custom' ? 'border-foreground scale-110' : 'border-transparent'
            }`}
            style={{
              background:
                customHex ??
                'conic-gradient(from 0deg,#ff0000,#ff9900,#ffee00,#33dd00,#0099ff,#6633ff,#ff0099,#ff0000)',
            }}
          >
            <input
              type="color"
              value={customHex ?? '#888888'}
              onChange={(e) => {
                if (setCustomAccent(e.target.value)) {
                  setCustomHex(e.target.value);
                  setAccentState('custom');
                }
              }}
              className="absolute inset-0 cursor-pointer opacity-0"
              aria-label={t('settings.customAccent')}
            />
            {accent !== 'custom' && (
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 flex items-center justify-center text-lg font-semibold text-white mix-blend-difference"
              >
                +
              </span>
            )}
          </label>
        </div>
      </Card>

      <Card>
        <SectionTitle>{t('settings.language')}</SectionTitle>
        <div className="flex gap-2">
          {(['en', 'el'] as const).map((lng) => (
            <button
              key={lng}
              onClick={() => onLangChange(lng)}
              aria-pressed={i18n.resolvedLanguage === lng}
              className={`h-11 rounded-md px-4 text-sm transition-colors ${
                i18n.resolvedLanguage === lng
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-elevated hover:bg-accent'
              }`}
            >
              {lng.toUpperCase()}
            </button>
          ))}
        </div>
      </Card>

      <DashboardLayoutSettings />
    </div>
  );
}
