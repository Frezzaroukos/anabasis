import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight, ClipboardList, History, Play, Settings2 } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { Logo } from '@/components/Logo';
import { db, queries } from '@/lib/db';
import { getCurrentUserId } from '@/lib/db/session';
import { listActivities, listPrograms } from '@/lib/db/queries';
import type { ActivityKind } from '@/lib/db/types';
import { ActivityChip } from '@/components/ActivityChip';
import { LastWorkoutCard } from './components/LastWorkoutCard';
import { cn } from '@/lib/utils';

export function WorkoutPage() {
  const { t } = useTranslation();
  const [starting, setStarting] = useState(false);
  const [kind, setKind] = useState<ActivityKind>('strength');
  /*
   * Πότε έγινε η προπόνηση. Τρεις καταστάσεις αντί για «now ή ημερομηνία»:
   * το «χθες» είναι μακράν η συχνότερη αναδρομική καταγραφή και δεν αξίζει
   * να ανοίγεις ημερολόγιο γι' αυτό.
   */
  const [whenMode, setWhenMode] = useState<'now' | 'yesterday' | 'pick'>('now');
  const todayIso = new Date().toISOString().slice(0, 10);
  const yesterdayIso = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  })();
  const [pickedDate, setPickedDate] = useState(todayIso);

  /** Η τελική ημερομηνία που πάει στο startWorkout (undefined = τώρα/live). */
  const onDate =
    whenMode === 'now' ? undefined : whenMode === 'yesterday' ? yesterdayIso : pickedDate;

  // Οι δραστηριότητες έρχονται από τη βάση, όχι από hardcoded λίστα — ό,τι
  // άθλημα προσθέσεις εμφανίζεται εδώ αμέσως, χωρίς αλλαγή κώδικα.
  const activities = useLiveQuery(() => listActivities(), [], []);
  const programs = useLiveQuery(() => listPrograms(), [], []);
  // Μόνο ρουτίνες του επιλεγμένου αθλήματος — μια push ρουτίνα δεν βοηθά
  // όταν πας για τρέξιμο.
  const matchingPrograms = programs.filter((p) => p.activity_kind === kind);

  // Ελέγχει αν υπάρχει έστω μία ολοκληρωμένη προπόνηση, για να ξέρουμε αν
  // θα δείξουμε το LastWorkoutCard ή ένα ενθαρρυντικό empty state.
  const hasHistory = useLiveQuery(async () => {
    const all = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
    return all.some((w) => w.ended_at != null && w.deleted_at == null);
  }, []);

  // Υπάρχει ολοκληρωμένη προπόνηση ΑΥΤΟΥ του αθλήματος; Καθορίζει αν
  // εμφανίζεται το «Επανάλαβε την τελευταία» — χωρίς προηγούμενη, το
  // startWorkoutFromLastOfKind δεν έχει τίποτα να επαναλάβει.
  const hasLastOfKind = useLiveQuery(async () => {
    const all = await db.workouts.where('user_id').equals(getCurrentUserId()).toArray();
    return all.some(
      (w) => w.activity_kind === kind && w.ended_at != null && w.deleted_at == null,
    );
  }, [kind]);

  const onStartProgram = async (programId: string) => {
    if (starting) return;
    setStarting(true);
    try {
      await queries.startWorkoutFromProgram(programId);
    } finally {
      setStarting(false);
    }
  };

  const onStart = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await queries.startWorkout(kind, onDate);
    } finally {
      setStarting(false);
    }
  };

  const onRepeatLast = async () => {
    if (starting) return;
    setStarting(true);
    try {
      await queries.startWorkoutFromLastOfKind(kind);
    } finally {
      setStarting(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {t('workout.title')}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('workout.empty')}</p>
      </header>

      <section>
        <p className="mb-2 text-xs uppercase text-muted-foreground">
          {t('workout.activityKind')}
        </p>
        <div className="flex flex-wrap gap-2">
          {activities.map((a) => (
            <ActivityChip
              key={a.key}
              activity={a}
              selected={kind === a.key}
              onClick={() => setKind(a.key)}
            />
          ))}
          <Link
            to="/activities"
            aria-label={t('activities.title')}
            className="flex items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <Settings2 className="h-3.5 w-3.5" />
            {t('activities.title')}
          </Link>
        </div>
      </section>

      {/*
        Πότε. Ήταν ένα κουμπί «Τώρα» δίπλα σε γυμνό <input type="date"> — δύο
        διαφορετικά ύφη για μία επιλογή, και ο επιλογέας ημερομηνίας ήταν
        μόνιμα ορατός ακόμα κι όταν δεν τον χρειαζόσουν. Τώρα: τρεις ισότιμες
        επιλογές, και το ημερολόγιο εμφανίζεται μόνο στο «Άλλη μέρα» — γιατί
        το 95% των καταγραφών είναι «τώρα» ή «χθες».
      */}
      <section>
        <p className="mb-2 text-xs uppercase text-muted-foreground">
          {t('workout.whenLabel')}
        </p>
        <div className="flex items-center rounded-lg border border-border/70 bg-card p-1">
          {(
            [
              ['now', t('workout.whenNow')],
              ['yesterday', t('workout.whenYesterday')],
              ['pick', t('workout.whenPast')],
            ] as const
          ).map(([mode, label]) => (
            <button
              key={mode}
              onClick={() => setWhenMode(mode)}
              className={cn(
                'flex-1 rounded-md px-3 py-1.5 text-sm transition-colors',
                whenMode === mode
                  ? 'bg-primary font-medium text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {whenMode === 'pick' && (
          <input
            type="date"
            max={todayIso}
            value={pickedDate}
            onChange={(e) => setPickedDate(e.target.value)}
            aria-label={t('workout.whenPast')}
            className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm"
          />
        )}
      </section>

      <Button size="lg" className="w-full" onClick={() => void onStart()} disabled={starting}>
        <Play className="h-5 w-5" />
        {whenMode === 'now' ? t('workout.start') : t('workout.addPast')}
      </Button>

      {/*
        One-tap «κάνε ό,τι έκανα την τελευταία φορά» — χωρίς αποθηκευμένη
        ρουτίνα. Ξεκινάει πάντα τώρα (ίδιο συμβόλαιο με startWorkoutFromProgram,
        δεν παίρνει ημερομηνία) — γι' αυτό ζει έξω από το «Πότε» flow.
      */}
      {hasLastOfKind === true && (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={() => void onRepeatLast()}
          disabled={starting}
        >
          <History className="h-5 w-5" />
          {t('workout.repeatLast')}
        </Button>
      )}

      {/*
        Ξεκίνα από αποθηκευμένη ρουτίνα. Οι ρουτίνες υπήρχαν αλλά ζούσαν σε
        άλλη σελίδα — έπρεπε να θυμηθείς να πας εκεί πρώτα. Εδώ είναι η
        στιγμή που τις χρειάζεσαι, φιλτραρισμένες στο άθλημα που διάλεξες.
      */}
      {matchingPrograms.length > 0 && (
        <section>
          <p className="mb-2 text-xs uppercase text-muted-foreground">
            {t('workout.fromRoutine')}
          </p>
          <ul className="space-y-2">
            {matchingPrograms.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => void onStartProgram(p.id)}
                  disabled={starting}
                  className="flex w-full items-center gap-3 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition-colors hover:border-primary/40 disabled:opacity-50"
                >
                  <ClipboardList className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.name}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hasHistory === false ? (
        <section className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border bg-card p-6 text-center">
          <Logo className="h-10 w-10 text-primary" />
          <p className="text-sm font-medium">{t('workout.emptyHistoryTitle')}</p>
          <p className="text-xs text-muted-foreground">{t('workout.emptyHistoryHint')}</p>
        </section>
      ) : (
        <LastWorkoutCard />
      )}
    </div>
  );
}
