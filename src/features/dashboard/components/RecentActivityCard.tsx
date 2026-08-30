import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { Dumbbell, Footprints, Bike, Waves, Activity as ActivityIcon } from 'lucide-react';
import { listActivities, listCompletedWorkouts } from '@/lib/db/queries';
import type { ActivityKind } from '@/lib/db/types';
import { SectionTitle } from '@/components/ui/Section';

/**
 * «Τι έκανα πρόσφατα» — η Αρχική δεν σε αναγκάζει να ΚΑΤΑΓΡΑΨΕΙΣ· την ανοίγεις
 * κι απλά θυμάσαι/βλέπεις. Οι τελευταίες προπονήσεις, κάθε μία σύνδεσμος στην
 * αναλυτική της. Χωρίς ιστορικό → null (η κάρτα εξαφανίζεται, όχι άδειο κουτί).
 */
const KIND_ICON: Record<string, typeof Dumbbell> = {
  strength: Dumbbell,
  run: Footprints,
  cycling: Bike,
  swim: Waves,
};

function iconFor(kind: ActivityKind) {
  return KIND_ICON[kind] ?? ActivityIcon;
}

function relativeDay(iso: string, locale: string): string {
  const d = new Date(iso);
  const today = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(today) - startOf(d)) / 86_400_000);
  if (days === 0) return locale === 'el' ? 'Σήμερα' : 'Today';
  if (days === 1) return locale === 'el' ? 'Χθες' : 'Yesterday';
  if (days < 7) return locale === 'el' ? `${days} μέρες πριν` : `${days} days ago`;
  return d.toLocaleDateString(locale === 'el' ? 'el-GR' : 'en-GB', { day: 'numeric', month: 'short' });
}

export function RecentActivityCard() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? 'en';
  // undefined=φορτώνει, []=πραγματικά καμία προπόνηση — δύο διαφορετικά states
  // (πριν μπέρδευαν, το «κενό» άστραφτε σαν να αποφασίστηκε αμέσως).
  const workouts = useLiveQuery(() => listCompletedWorkouts(), [], undefined);
  const activityLabels = useLiveQuery(
    async () => new Map((await listActivities(true)).map((a) => [a.key, a.label])),
    [],
    new Map<string, string>(),
  );

  if (workouts === undefined) {
    return (
      <section className="rounded-xl bg-card p-4">
        <div className="mb-3 h-4 w-24 animate-pulse rounded bg-muted/40" />
        <div className="space-y-2">
          <div className="h-11 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-11 animate-pulse rounded-lg bg-muted/30" />
        </div>
      </section>
    );
  }

  const recent = workouts.slice(0, 4);
  if (recent.length === 0) return null;

  return (
    <section className="rounded-xl bg-card p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <SectionTitle>{t('dashboard.recentActivity')}</SectionTitle>
        <Link to="/calendar" className="text-xs text-muted-foreground hover:text-foreground">
          {t('dashboard.viewAll')}
        </Link>
      </div>
      <ul className="divide-y divide-border/60">
        {recent.map((w) => {
          const Icon = iconFor(w.activity_kind);
          const label = activityLabels.get(w.activity_kind) ?? w.workout_type ?? w.activity_kind;
          const mins = w.duration_seconds ? Math.round(w.duration_seconds / 60) : null;
          const dist = w.distance_km != null ? `${w.distance_km} km` : null;
          const meta = [dist, mins != null ? `${mins}′` : null].filter(Boolean).join(' · ');
          return (
            <li key={w.id}>
              <Link
                to={`/history/${w.id}`}
                className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 ring-offset-background transition-all duration-150 hover:bg-elevated active:bg-elevated/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-elevated text-muted-foreground">
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium capitalize">{label}</span>
                  {meta && <span className="block text-xs text-muted-foreground tabular-nums">{meta}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                  {relativeDay(w.started_at, locale)}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
