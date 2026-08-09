import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import { exportAll, importAll, updateSettings } from '@/lib/db/queries';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Moon, Sun, Monitor } from 'lucide-react';
import { ACCENTS, getStoredAccent, getStoredTheme, setAccent, setTheme, type Theme } from '@/lib/theme';

const REST_PRESETS = [60, 90, 120, 180, 240, 300];

import { DashboardLayoutSettings } from './components/DashboardLayoutSettings';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const fileRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [theme, setThemeState] = useState<Theme>(getStoredTheme());
  const [accent, setAccentState] = useState<string>(getStoredAccent());

  const settings = useLiveQuery(
    () => db.app_settings.where('user_id').equals(getCurrentUserId()).first(),
    [],
  );
  const stats = useLiveQuery(
    async () => ({
      workouts: await db.workouts.count(),
      sets: await db.sets.count(),
      prs: await db.personal_records.count(),
      steps: await db.user_skill_step_completions.count(),
    }),
    [],
    { workouts: 0, sets: 0, prs: 0, steps: 0 },
  );

  const onLangChange = (lang: 'en' | 'el') => {
    void i18n.changeLanguage(lang);
    void db.users.update(getCurrentUserId(), {
      language: lang,
      updated_at: new Date().toISOString(),
    });
  };

  const onExport = async () => {
    const json = await exportAll();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `anabasis-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(t('settings.exported'));
  };

  const onImportFile = async (file: File) => {
    const res = await importAll(await file.text());
    setStatus(
      res.ok
        ? `${t('settings.imported')} (${Object.values(res.counts ?? {}).reduce(
            (a, b) => a + b,
            0,
          )})`
        : t(`settings.${res.message}`),
    );
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('settings.title')}
        </h1>
      </header>

      <Link
        to="/profile"
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm transition-colors hover:bg-accent"
      >
        <span className="font-medium">{t('profile.title')}</span>
        <span aria-hidden className="text-muted-foreground">→</span>
      </Link>

      <Link
        to="/import"
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm transition-colors hover:bg-accent"
      >
        <span className="font-medium">{t('import.title')}</span>
        <span aria-hidden className="text-muted-foreground">→</span>
      </Link>

      <Link
        to="/branding"
        className="flex items-center justify-between rounded-lg border border-border bg-card p-4 text-sm transition-colors hover:bg-accent"
      >
        <span className="font-medium">Logo & Brand</span>
        <span aria-hidden className="text-muted-foreground">→</span>
      </Link>

      <DashboardLayoutSettings />

      {/* Η βιβλιοθήκη σου — οθόνες «στήσε το μια φορά», όχι καθημερινής χρήσης. */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">{t('settings.library')}</p>
        <div className="grid gap-2">
          {(
            [
              ['/exercises', 'exercises.title'],
              ['/activities', 'activities.title'],
              ['/skills', 'skills.title'],
            ] as const
          ).map(([to, key]) => (
            <Link
              key={to}
              to={to}
              className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-accent"
            >
              <span>{t(key)}</span>
              <span aria-hidden className="text-muted-foreground">→</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Theme */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">{t('settings.theme')}</p>
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
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm transition-colors ${
                  theme === th ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(`settings.theme_${th}`)}
              </button>
            );
          })}
        </div>

        {/* Accent — το κύριο χρώμα του app. Το χρυσό των ρεκόρ μένει σταθερό. */}
        <p className="mb-2 mt-4 text-sm font-medium">{t('settings.accent')}</p>
        <div className="flex flex-wrap gap-2">
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
              className={`h-9 w-9 rounded-full border-2 transition-transform active:scale-90 ${
                accent === a.key ? 'border-foreground scale-110' : 'border-transparent'
              }`}
              style={{ background: a.swatch }}
            />
          ))}
        </div>
      </section>

      {/* Language */}
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

      {/* Rest timer — τώρα επεξεργάσιμο */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">{t('settings.restTimer')}</p>
        <div className="flex flex-wrap gap-2">
          {REST_PRESETS.map((s) => (
            <button
              key={s}
              onClick={() => void updateSettings({ default_rest_timer_seconds: s })}
              className={`rounded-md border border-border px-3 py-1.5 font-mono text-sm transition-colors ${
                settings?.default_rest_timer_seconds === s
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
            >
              {s < 60 ? `${s}s` : `${s / 60}m`}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
          <div>
            <p className="text-sm">{t('settings.restNotify')}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t('settings.restNotifyHint')}
            </p>
          </div>
          <button
            role="switch"
            aria-checked={settings?.notify_rest_timer ?? true}
            aria-label={t('settings.restNotify')}
            onClick={() =>
              void updateSettings({
                notify_rest_timer: !(settings?.notify_rest_timer ?? true),
              })
            }
            className={`h-6 w-11 shrink-0 rounded-full border border-border transition-colors ${
              (settings?.notify_rest_timer ?? true) ? 'bg-primary' : 'bg-muted'
            }`}
          >
            <span
              className={`block h-4 w-4 rounded-full bg-background transition-transform ${
                (settings?.notify_rest_timer ?? true)
                  ? 'translate-x-6'
                  : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </section>

      {/* Units */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="mb-3 text-sm font-medium">{t('settings.units')}</p>
        <div className="flex gap-2">
          {(['kg', 'lb'] as const).map((u) => (
            <button
              key={u}
              onClick={() => void updateSettings({ weight_unit: u })}
              className={`rounded-md border border-border px-3 py-1.5 text-sm uppercase transition-colors ${
                settings?.weight_unit === u
                  ? 'bg-primary text-primary-foreground'
                  : 'hover:bg-accent'
              }`}
            >
              {u}
            </button>
          ))}
        </div>
      </section>

      {/* Your data — local-first σημαίνει ότι φεύγει όποτε θες */}
      <section className="rounded-lg border border-border bg-card p-4">
        <p className="text-sm font-medium">{t('settings.yourData')}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {t('settings.dataHint')}
        </p>
        <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
          {(
            [
              ['workouts', stats.workouts],
              ['sets', stats.sets],
              ['prs', stats.prs],
              ['steps', stats.steps],
            ] as const
          ).map(([k, v]) => (
            <div key={k} className="rounded-md bg-muted/50 py-2">
              <dt className="text-[10px] uppercase text-muted-foreground">
                {t(`settings.${k}`)}
              </dt>
              <dd className="font-mono text-sm">{v}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-4 flex gap-2">
          <Button onClick={() => void onExport()}>{t('settings.export')}</Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()}>
            {t('settings.import')}
          </Button>
          <Input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onImportFile(f);
              e.target.value = '';
            }}
          />
        </div>
        {status && (
          <p className="mt-3 text-xs text-muted-foreground" role="status">
            {status}
          </p>
        )}
      </section>

      <p className="text-center text-xs text-muted-foreground">
        Anabasis · {t('settings.offlineNote')}
      </p>
    </div>
  );
}
