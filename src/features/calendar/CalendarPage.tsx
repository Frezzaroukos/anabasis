import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useLiveQuery } from 'dexie-react-hooks';
import { ArrowUpFromLine, ChevronLeft, ChevronRight, ClipboardPaste, Flame, House, Play, Plus } from 'lucide-react';
import {
  countProgramDaySessions,
  createProgram,
  getCalendar,
  getProgramWithExercises,
  getTrainingInsights,
  listActivities,
  listProgramDays,
  listPrograms,
  localDay,
  startAdHocWorkout,
  startWorkoutFromProgram,
  startWorkoutFromProgramDay,
} from '@/lib/db/queries';
import type { DayActivities } from '@/lib/db/queries';
import { formatHMS } from '@/hooks/useSessionTimer';
import { useAppSettings } from '@/hooks/useAppSettings';
import { formatWeight } from '@/lib/units';
import { Input } from '@/components/ui/input';
import { BottomSheet } from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import { countProgramDayExercises } from '@/lib/db/schedule';
import {
  listScheduledSessions,
  startScheduledSession,
} from '@/lib/db/scheduledSessions';
import type { ScheduledSession } from '@/lib/db/types';
import { QuickPasteWorkoutSheet } from '@/features/workout/components/QuickPasteWorkoutSheet';
import {
  ScheduledSessionSheet,
  type SchedulableProgram,
} from './components/ScheduledSessionSheet';
import { DayWorkoutRow } from './components/DayWorkoutRow';
import { DOT_SIZE_CLASS, dotSizeOf, parseDayKey, weekAdherenceTint } from './calendarMath';

/**
 * Τα χρώματα/σύμβολα ΔΕΝ είναι πια hardcoded — έρχονται από τον πίνακα
 * `activities`, ώστε ένα δικό σου άθλημα να εμφανίζεται εδώ σωστά χωρίς
 * να αγγίξει κανείς κώδικα.
 */
const FALLBACK_DOT = 'bg-zinc-400';

function monthBounds(year: number, month: number) {
  const first = new Date(year, month, 1);
  const last = new Date(year, month + 1, 0);
  return { first, last };
}

export function CalendarPage() {
  const { t, i18n } = useTranslation();
  const settings = useAppSettings();
  const unit = settings?.weight_unit ?? 'kg';
  const today = localDay();
  const [monthDirection, setMonthDirection] = useState<'next' | 'prev'>('next');
  const monthStripRef = useRef<HTMLDivElement>(null);
  const monthButtonsRef = useRef<Record<number, HTMLButtonElement | null>>({});
  // Roving focus για το πλέγμα ημερών (πλήκτρα βέλους): κρατά ref ανά ημέρα
  // ώστε το βέλος να μετακινεί πραγματικό DOM focus, όχι μόνο επιλογή.
  const dayButtonsRef = useRef<Record<string, HTMLButtonElement | null>>({});
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });
  const [selected, setSelected] = useState<string | null>(today);
  const [addOpen, setAddOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<ScheduledSession | null>(null);
  const [adHocLabel, setAdHocLabel] = useState('');
  // Τα start-helpers γυρνούν null όταν υπάρχει ήδη ενεργή προπόνηση (ένας
  // guard στο queries.ts). Πριν, το πάτημα απλά δεν έκανε ΤΙΠΟΤΑ.
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const navigate = useNavigate();

  const activities = useLiveQuery(() => listActivities(true), [], []);
  // Μόνο για το σερί στον υπότιτλο του μήνα — «glanceable» χωρίς να
  // ανοίξεις το Home (ARCHITECTURE-V4 §6, η ίδια πηγή αλήθειας με το hero).
  const insights = useLiveQuery(() => getTrainingInsights(30), [], null);

  /**
   * Κάθε πρόγραμμα → οι μέρες του, με το επόμενο αύξοντα αριθμό ήδη
   * υπολογισμένο («Upper #3»). Προγράμματα χωρίς ρητές μέρες (legacy/χωρίς
   * multi-day setup ακόμα) δεν έχουν τίποτα να διαλέξεις εδώ — filtered out.
   */
  const programsWithDays = useLiveQuery(
    async () => {
      const programs = await listPrograms();
      const entries = await Promise.all(
        programs.map(async (program) => {
          const days = await listProgramDays(program.id);
          const options = await Promise.all(
            days.map(async (day) => ({
              day,
              nextNo: (await countProgramDaySessions(day.id)) + 1,
              // Χωρίς αυτό ξεκινούσες «Upper» χωρίς να ξέρεις αν έχει 8
              // ασκήσεις ή καμία — και το ανακάλυπτες στην οθόνη καταγραφής.
              exercises: await countProgramDayExercises(day.id),
            })),
          );
          // Πρόγραμμα χωρίς ρητές μέρες (flat) αλλά ΜΕ ασκήσεις: ξεκινά ολόκληρο
          // ως μία επιλογή — αλλιώς «εξαφανιζόταν» εδώ και έβγαινε το μήνυμα
          // «δεν έχεις μέρες προγράμματος» (owner bug).
          const exerciseCount =
            days.length === 0 ? (await getProgramWithExercises(program.id))?.exercises.length ?? 0 : 0;
          return { program, days: options, exerciseCount };
        }),
      );
      // Κράτα ό,τι έχει κάτι να ξεκινήσεις — μέρες ή flat ασκήσεις.
      return entries.filter((entry) => entry.days.length > 0 || entry.exerciseCount > 0);
    },
    [],
    undefined,
  );

  /**
   * Το BottomSheet cleanup (`useBackToClose`) καλεί `history.back()` ασύγχρονα.
   * Περιμένουμε το `popstate` πριν ανοίξουμε δεύτερο sheet ή πλοηγηθούμε σε
   * άλλο route (ίδιο fix με BottomTabNav — αλλιώς το `history.back()` ακυρώνει
   * το νέο route/sheet).
   */
  const runAfterSheetClose = (action: () => void) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      window.removeEventListener('popstate', go);
      action();
    };
    window.addEventListener('popstate', go, { once: true });
    window.setTimeout(go, 300);
  };
  // Προσθήκη προπόνησης στην επιλεγμένη μέρα (σήμερα = live, παλιά = backdated).
  const onPickProgramDay = async (dayId: string) => {
    if (!selected || starting) return;
    if (selected > today) {
      setStartError(t('calendar.futureBlocked'));
      return;
    }
    setStarting(true);
    try {
      const result = await startWorkoutFromProgramDay(dayId, selected === today ? undefined : selected);
      if (!result) {
        setStartError(t('calendar.startBlocked'));
        return;
      }
      setAddOpen(false);
      runAfterSheetClose(() => navigate('/workout/active'));
    } finally {
      setStarting(false);
    }
  };
  // Flat πρόγραμμα (χωρίς μέρες) — ξεκινά ολόκληρο.
  const onPickProgram = async (programId: string) => {
    if (!selected || starting) return;
    if (selected > today) {
      setStartError(t('calendar.futureBlocked'));
      return;
    }
    setStarting(true);
    try {
      const result = await startWorkoutFromProgram(programId, selected === today ? undefined : selected);
      if (!result) {
        setStartError(t('calendar.startBlocked'));
        return;
      }
      setAddOpen(false);
      runAfterSheetClose(() => navigate('/workout/active'));
    } finally {
      setStarting(false);
    }
  };
  /**
   * Ad-hoc = ελεύθερο κείμενο, όχι επιλογή από 5 προκαθορισμένες
   * δραστηριότητες (owner feedback: «να μπορεί να το γράψει όπως επιθυμεί»).
   * Ό,τι γράψει γίνεται κατευθείαν το label της προπόνησης· η δραστηριότητα
   * μένει γενική (strength) — δεν υπάρχει κατηγοριοποίηση εδώ, μόνο κείμενο.
   */
  const onSubmitAdHoc = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = adHocLabel.trim();
    if (!selected || !label || starting) return;
    if (selected > today) {
      setStartError(t('calendar.futureBlocked'));
      return;
    }
    setStarting(true);
    try {
      const result = await startAdHocWorkout(
        'strength',
        selected === today ? undefined : selected,
        label,
      );
      if (!result) {
        setStartError(t('calendar.startBlocked'));
        return;
      }
      setAddOpen(false);
      setAdHocLabel('');
      runAfterSheetClose(() => navigate('/workout/active'));
    } finally {
      setStarting(false);
    }
  };
  /** Κενή συνεδρία για την επιλεγμένη μέρα — σήμερα ή backfill, χωρίς να ανοίξει το sheet. */
  const onQuickLogDay = async () => {
    if (!selected || starting || selected > today) return;
    setStarting(true);
    setStartError(null);
    try {
      const result = await startAdHocWorkout(
        'strength',
        selected === today ? undefined : selected,
      );
      if (!result) {
        setStartError(t('calendar.startBlocked'));
        return;
      }
      navigate('/workout/active');
    } finally {
      setStarting(false);
    }
  };
  const onQuickStart = async (label: string, names: string[]) => {
    if (!selected || starting) return;
    if (selected > today) {
      setStartError(t('calendar.futureBlocked'));
      return;
    }
    setStarting(true);
    try {
      const result = await startAdHocWorkout(
        'strength',
        selected === today ? undefined : selected,
        label,
      );
      if (!result) {
        setStartError(t('calendar.startBlocked'));
        return;
      }
      setAddOpen(false);
      setAdHocLabel('');
      runAfterSheetClose(() =>
        navigate('/workout/active', { state: { seedExercises: names } }),
      );
    } finally {
      setStarting(false);
    }
  };

  const closeAddSheet = () => {
    setAddOpen(false);
    setAdHocLabel('');
    setStartError(null);
  };

  /**
   * «Ξεκίνα» από planned row: ίδιος δρόμος με το κανονικό start (πρόγραμμα-μέρα
   * / flat πρόγραμμα / ad-hoc) και σύνδεση του workout με το planned row. Το
   * status γίνεται `done` μόνο όταν ολοκληρωθεί η προπόνηση (endWorkout).
   */
  const onStartScheduled = async (session: ScheduledSession): Promise<boolean> => {
    if (starting) return false;
    setStarting(true);
    setStartError(null);
    try {
      const result = await startScheduledSession(session);
      if (!result) {
        setStartError(t('calendar.startBlocked'));
        return false;
      }
      setScheduleOpen(false);
      setEditingSession(null);
      runAfterSheetClose(() => navigate('/workout/active'));
      return true;
    } finally {
      setStarting(false);
    }
  };

  const openScheduleSheet = (session: ScheduledSession | null) => {
    setEditingSession(session);
    setScheduleOpen(true);
  };
  const closeScheduleSheet = () => {
    setScheduleOpen(false);
    setEditingSession(null);
    setStartError(null);
  };

  // Γρήγορη δημιουργία προγράμματος από το ημερολόγιο: φτιάχνει κενό και πάει
  // κατευθείαν στον editor του, ώστε να το χτίσεις χωρίς να ψάχνεις το section.
  const onCreateProgram = async () => {
    const p = await createProgram(t('programs.namePlaceholder'));
    setAddOpen(false);
    runAfterSheetClose(() => navigate(`/programs/${p.id}`));
  };
  const dotOf = (kind: string) =>
    activities.find((a) => a.key === kind)?.dot_class ?? FALLBACK_DOT;
  const labelOf = (kind: string) =>
    activities.find((a) => a.key === kind)?.label ?? kind;

  const { first, last } = monthBounds(cursor.year, cursor.month);
  const fromKey = localDay(first);
  const toKey = localDay(last);

  const cal = useLiveQuery(
    () => getCalendar(fromKey, toKey),
    [fromKey, toKey],
    new Map<string, DayActivities>(),
  );

  // Planned sessions του ορατού μήνα — ΔΕΝ είναι workouts· ζουν σε ξεχωριστό
  // πίνακα και δείχνονται με δικό τους (κούφιο) marker.
  const scheduled = useLiveQuery(
    () => listScheduledSessions(fromKey, toKey),
    [fromKey, toKey],
    [],
  );
  const scheduledByDate = useMemo(() => {
    const map = new Map<string, ScheduledSession[]>();
    for (const session of scheduled) {
      const list = map.get(session.date) ?? [];
      list.push(session);
      map.set(session.date, list);
    }
    return map;
  }, [scheduled]);
  const plannedDates = useMemo(() => {
    const set = new Set<string>();
    for (const session of scheduled) {
      if (session.status === 'planned') set.add(session.date);
    }
    return set;
  }, [scheduled]);
  const schedulablePrograms = useMemo<SchedulableProgram[]>(
    () =>
      (programsWithDays ?? []).map(({ program, days }) => ({
        id: program.id,
        name: program.name,
        days: days.map(({ day }) => ({ id: day.id, name: day.name })),
      })),
    [programsWithDays],
  );

  // Πλέγμα: ξεκινά Δευτέρα (ευρωπαϊκή εβδομάδα)
  const cells = useMemo(() => {
    const lead = (first.getDay() + 6) % 7;
    const out: Array<{ key: string; day: number } | null> = [];
    for (let i = 0; i < lead; i++) out.push(null);
    for (let d = 1; d <= last.getDate(); d++) {
      const date = new Date(cursor.year, cursor.month, d);
      out.push({ key: localDay(date), day: d });
    }
    return out;
  }, [cursor.year, cursor.month, first, last]);

  // Το πλέγμα σπάει σε εβδομάδες-γραμμές. Πριν ήταν ένα flat grid 7 στηλών και
  // το adherence tint έμπαινε σε ΚΑΘΕ κελί ξεχωριστά: με τα κενά ανάμεσά τους
  // διαβαζόταν σαν επτά ξεχωριστές κηλίδες, όχι σαν «αυτή η εβδομάδα ήταν
  // γεμάτη». Ως γραμμή, το wash είναι συνεχές και λέει κάτι με μία ματιά.
  const weeks = useMemo(() => {
    const out: Array<Array<{ key: string; day: number } | null>> = [];
    for (let i = 0; i < cells.length; i += 7) {
      const week = cells.slice(i, i + 7);
      while (week.length < 7) week.push(null);
      out.push(week);
    }
    return out;
  }, [cells]);

  const weekTints = useMemo(
    () => weeks.map((week) => weekAdherenceTint(week.map((c) => c?.key ?? null), cal)),
    [weeks, cal],
  );

  const monthLabel = first.toLocaleDateString(i18n.resolvedLanguage, {
    month: 'long',
    year: 'numeric',
  });
  const weekdays = useMemo(() => {
    // Δευτέρα-πρώτα ονόματα ημερών από τη locale
    const base = new Date(2024, 0, 1); // Δευτέρα
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(i18n.resolvedLanguage, { weekday: 'short' });
    });
  }, [i18n.resolvedLanguage]);

  const shift = (delta: number) => {
    setMonthDirection(delta > 0 ? 'next' : 'prev');
    setCursor(({ year, month }) => {
      const m = month + delta;
      return { year: year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  };

  const goToday = () => {
    const d = new Date();
    const from = cursor.year * 12 + cursor.month;
    const to = d.getFullYear() * 12 + d.getMonth();
    setMonthDirection(to >= from ? 'next' : 'prev');
    setCursor({ year: d.getFullYear(), month: d.getMonth() });
    setSelected(today);
  };

  const goToMonth = (month: number) => {
    setMonthDirection(month >= cursor.month ? 'next' : 'prev');
    setCursor({ year: cursor.year, month });
  };

  /**
   * Πλοήγηση πλέγματος με βέλη (APG grid pattern): ←/→ μέρα, ↑/↓ εβδομάδα,
   * Home/End αρχή/τέλος εβδομάδας. Μετακινεί το focus στο κελί της νέας
   * ημέρας· αν βγει εκτός μήνα, αλλάζει μήνα και εστιάζει την αντίστοιχη μέρα
   * μόλις το πλέγμα ξανα-render-άρει.
   */
  const onDayKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, key: string) => {
    const delta =
      e.key === 'ArrowLeft'
        ? -1
        : e.key === 'ArrowRight'
          ? 1
          : e.key === 'ArrowUp'
            ? -7
            : e.key === 'ArrowDown'
              ? 7
              : 0;
    let targetKey: string | null = null;
    if (delta !== 0) {
      const base = parseDayKey(key);
      base.setDate(base.getDate() + delta);
      targetKey = localDay(base);
    } else if (e.key === 'Home' || e.key === 'End') {
      const base = parseDayKey(key);
      // Δευτέρα = 0 στη δική μας εβδομάδα (getDay: Κυρ=0 → +6 %7)
      const weekday = (base.getDay() + 6) % 7;
      base.setDate(base.getDate() + (e.key === 'Home' ? -weekday : 6 - weekday));
      targetKey = localDay(base);
    } else if (e.key === 'PageUp' || e.key === 'PageDown') {
      e.preventDefault();
      shift(e.key === 'PageUp' ? -1 : 1);
      return;
    } else {
      return;
    }
    e.preventDefault();
    const target = parseDayKey(targetKey);
    setSelected(targetKey);
    if (target.getMonth() !== cursor.month || target.getFullYear() !== cursor.year) {
      setMonthDirection(target > new Date(cursor.year, cursor.month, 1) ? 'next' : 'prev');
      setCursor({ year: target.getFullYear(), month: target.getMonth() });
    }
    // Το κελί μπορεί να μην υπάρχει ακόμα (αλλαγή μήνα) — εστίασε στο επόμενο frame.
    requestAnimationFrame(() => dayButtonsRef.current[targetKey!]?.focus());
  };

  useEffect(() => {
    const strip = monthStripRef.current;
    const active = monthButtonsRef.current[cursor.month];
    if (!strip || !active) return;
    const left = active.offsetLeft - strip.clientWidth / 2 + active.clientWidth / 2;
    if (typeof strip.scrollTo === 'function') {
      strip.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
    }
  }, [cursor.month, cursor.year]);

  const day = selected ? cal.get(selected) : undefined;
  const dayScheduled = selected ? (scheduledByDate.get(selected) ?? []) : [];

  // Σύνοψη ορατού μήνα — δίνει νόημα σε άδεια/γεμάτη σελίδα χωρίς να ανοίξεις μέρα.
  const monthStats = useMemo(() => {
    let workouts = 0;
    const kinds = new Set<string>();
    const days = new Set<string>();
    for (const [key, d] of cal) {
      if (!key.startsWith(`${cursor.year}-${String(cursor.month + 1).padStart(2, '0')}`)) continue;
      for (const w of d.workouts) {
        workouts += 1;
        kinds.add(w.kind);
        days.add(key);
      }
    }
    return { workouts, kinds: kinds.size, days: days.size };
  }, [cal, cursor.year, cursor.month]);

  // Το σερί έχει νόημα μόνο στον τρέχοντα πραγματικό μήνα — σε παλιό/μελλοντικό
  // μήνα θα μπέρδευε («σερί» δίπλα σε Μάρτιο ενώ είσαι σε Αύγουστο).
  const isCurrentMonthView = useMemo(() => {
    const now = new Date();
    return now.getFullYear() === cursor.year && now.getMonth() === cursor.month;
  }, [cursor.year, cursor.month]);
  const streakDays = isCurrentMonthView ? (insights?.streakDays ?? 0) : 0;

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-border/50 bg-gradient-to-br from-primary/5 via-card to-card p-4 shadow-elevated">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate font-display text-2xl font-semibold tracking-tight capitalize">
              {monthLabel}
            </h1>
            {/* Σερί, glanceable — ίδια γλώσσα (flame + primary) με το hero του Home. */}
            {streakDays > 1 && (
              <span
                aria-label={t('calendar.streakDays', { count: streakDays })}
                className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-primary"
              >
                <Flame className="h-3 w-3" aria-hidden />
                <span className="font-mono text-xs tabular-nums">{streakDays}</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-primary">
            <span>
              {t('calendar.todayMarked', {
                date: parseDayKey(today).toLocaleDateString(i18n.resolvedLanguage),
              })}
            </span>
            {!isCurrentMonthView && (
              <button
                type="button"
                onClick={goToday}
                className="font-medium underline underline-offset-2 hover:text-foreground"
              >
                {t('calendar.backToToday')}
              </button>
            )}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
            {monthStats.workouts > 0 ? (
              <>
                <span className="rounded-full bg-card/80 px-2 py-1">
                  {t('calendar.monthWorkouts', { count: monthStats.workouts })}
                </span>
                {monthStats.days > 1 && (
                  <span className="rounded-full bg-card/80 px-2 py-1">
                    {t('calendar.monthDays', { count: monthStats.days })}
                  </span>
                )}
              </>
            ) : (
              <span className="rounded-full bg-card/80 px-2 py-1">{t('calendar.monthEmpty')}</span>
            )}
          </div>
          <div
            ref={monthStripRef}
            role="group"
            className="mt-3 flex snap-x snap-mandatory gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            aria-label={t('calendar.title')}
          >
            {Array.from({ length: 12 }, (_, month) => {
              const label = new Date(cursor.year, month, 1).toLocaleDateString(
                i18n.resolvedLanguage,
                { month: 'short' },
              );
              return (
                <button
                  key={month}
                  ref={(el) => {
                    monthButtonsRef.current[month] = el;
                  }}
                  type="button"
                  onClick={() => goToMonth(month)}
                  aria-pressed={cursor.month === month}
                  // Πλήρες όνομα μήνα (όχι «Ιαν») για screen reader.
                  aria-label={new Date(cursor.year, month, 1).toLocaleDateString(
                    i18n.resolvedLanguage,
                    { month: 'long', year: 'numeric' },
                  )}
                  className={cn(
                    'shrink-0 snap-center rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
                    cursor.month === month
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card/80 text-muted-foreground hover:text-foreground',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>
        {/*
          Ένα ενιαίο σύνολο πλοήγησης. Πριν, ένας σύνδεσμος «Σώμα» ήταν
          σφηνωμένος ανάμεσα στα βελάκια — άσχετη σελίδα σε θέση ελέγχου
          μήνα· ζει πλέον στο «Περισσότερα». Τα βελάκια ήταν χαρακτήρες
          «←/→» σε κουτάκια· τώρα εικονίδια, ίδιου βάρους με τα υπόλοιπα.
        */}
        <div className="flex shrink-0 items-center self-end rounded-lg bg-card sm:self-auto">
          <button
            onClick={() => shift(-1)}
            aria-label={t('calendar.prev')}
            className="flex h-11 w-11 items-center justify-center rounded-l-lg text-muted-foreground ring-offset-background transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-95 focus-visible:z-10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            onClick={goToday}
            aria-label={t('calendar.todayMarked', {
              date: parseDayKey(today).toLocaleDateString(i18n.resolvedLanguage),
            })}
            className="h-11 border-x border-border/70 px-4 text-xs font-medium ring-offset-background transition-all duration-150 hover:bg-accent active:scale-95 focus-visible:z-10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {t('calendar.today')}
          </button>
          <button
            onClick={() => shift(1)}
            aria-label={t('calendar.next')}
            className="flex h-11 w-11 items-center justify-center rounded-r-lg text-muted-foreground ring-offset-background transition-all duration-150 hover:bg-accent hover:text-foreground active:scale-95 focus-visible:z-10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
        </div>
      </header>

      {/* key = μήνας: αλλαγή μήνα ξαναπαίζει το rise-in — «η σελίδα άλλαξε»,
          όχι απότομο swap πλέγματος. */}
      {/* max-sm:px-1.5 → σε στενά τηλέφωνα (375px) τα 7 κελιά της ημέρας
          φτάνουν ≥44px πλάτος (WCAG 2.5.5)· tablet/desktop κρατούν άνετο p-3. */}
      <div
        key={`${cursor.year}-${cursor.month}`}
        className={cn(
          'rounded-2xl border border-border/50 bg-card p-3 shadow-elevated max-sm:px-1.5',
          monthDirection === 'next' ? 'animate-slide-in-forward' : 'animate-slide-in-back',
        )}
      >
        <div className="mb-1 grid grid-cols-7 gap-1 border-b border-border/60 pb-1.5">
          {weekdays.map((w) => (
            <div
              key={w}
              className="py-1 text-center text-xs uppercase tracking-wide text-muted-foreground"
            >
              {w}
            </div>
          ))}
        </div>
        <div className="space-y-0.5">
          {weeks.map((week, wi) => (
            <div
              key={wi}
              className={cn('grid grid-cols-7 gap-0.5 rounded-lg', weekTints[wi])}
            >
              {week.map((c, di) =>
                c === null ? (
                  <div key={`pad-${wi}-${di}`} />
                ) : (
                  <button
                    key={c.key}
                    ref={(el) => {
                      dayButtonsRef.current[c.key] = el;
                    }}
                    onClick={() => setSelected(c.key)}
                    onKeyDown={(e) => onDayKeyDown(e, c.key)}
                    // Πλήρης ημερομηνία για screen reader — το γυμνό «12» θα ήταν
                    // «δεκαδύο» χωρίς μήνα/έτος. Το aria-current="date" σημαίνει το
                    // «σήμερα» ξεχωριστά από την τρέχουσα επιλογή (aria-pressed).
                    aria-label={parseDayKey(c.key).toLocaleDateString(i18n.resolvedLanguage, {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                    aria-current={c.key === today ? 'date' : undefined}
                    aria-pressed={selected === c.key}
                    className={cn(
                      // min-h 48px (≥ WCAG 2.5.5) στο κινητό, πιο άνετο από sm.
                      // Ήταν 56px με gap-1: ένας άδειος μήνας έπιανε ~700px ύψος
                      // για μηδέν πληροφορία και σε ανάγκαζε να σκρολάρεις.
                      'flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg p-0.5 ring-offset-background transition-all duration-150 active:scale-[0.97] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 sm:min-h-16',
                      // Δύο ΞΕΧΩΡΙΣΤΑ σήματα: «σήμερα» ζει στον αριθμό (γεμάτος
                      // κύκλος), «επιλεγμένη» στο κελί. Πριν το σήμερα είχε ΚΑΙ
                      // κύκλο ΚΑΙ ring γύρω από το κελί — δύο σήματα για το ίδιο
                      // πράγμα, που έκρυβαν ποια μέρα είναι όντως επιλεγμένη.
                      selected === c.key
                        ? 'bg-elevated ring-1 ring-inset ring-primary/40'
                        : 'hover:bg-muted/40',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-6 w-6 items-center justify-center rounded-full font-mono text-xs tabular-nums transition-colors',
                        c.key === today
                          ? 'bg-primary font-semibold text-primary-foreground'
                          : 'text-muted-foreground',
                      )}
                    >
                      {c.day}
                    </span>
                    {/* Σταθερό ύψος: αλλιώς οι μέρες με κουκκίδες ήταν ψηλότερες
                        από τις κενές και η γραμμή «κουνιόταν». Στο κινητό (320px)
                        το ΠΑΤΗΜΑ είναι ολόκληρο το κελί (button, min-h-12=48px)· το
                        h-6/h-7 είναι διακοσμητικός κύκλος, όχι ο στόχος αφής. */}
                    <span aria-hidden className="flex h-2.5 flex-wrap items-center justify-center gap-0.5">
                      {(() => {
                        const ws = cal.get(c.key)?.workouts ?? [];
                        const overflow = ws.length > 4;
                        const shown = overflow ? ws.slice(0, 3) : ws.slice(0, 4);
                        return (
                          <>
                            {shown.map((w) => (
                              <span
                                key={w.id}
                                title={t('calendar.magnitudeHint')}
                                className={cn(
                                  'rounded-full',
                                  DOT_SIZE_CLASS[dotSizeOf(w)],
                                  dotOf(w.kind),
                                )}
                              />
                            ))}
                            {overflow && (
                              <span className="font-mono text-xs leading-none text-muted-foreground">
                                +{ws.length - 3}
                              </span>
                            )}
                            {plannedDates.has(c.key) && (
                              <span
                                title={t('calendar.planned')}
                                className="h-2 w-2 rounded-full border border-primary bg-transparent"
                              />
                            )}
                          </>
                        );
                      })()}
                    </span>
                    {/* Το βάρος σώματος δεν χωρά σε κελί 48px χωρίς να γίνει
                        θόρυβος στα 9px — μένει από sm και πάνω, και πάντα στη
                        λεπτομέρεια της ημέρας. */}
                    {cal.get(c.key)?.weight != null && (
                      <span className="hidden font-mono text-xs tabular-nums text-muted-foreground sm:block">
                        {formatWeight(cal.get(c.key)!.weight!, unit, {
                          granularity: 'body',
                          withUnit: false,
                        })}
                      </span>
                    )}
                  </button>
                ),
              )}
            </div>
          ))}
        </div>

        {/* Οι κουκκίδες μεγαλώνουν με το μέγεθος της συνεδρίας. Ήταν μόνο σε
            `title` — αόρατο σε κάθε συσκευή αφής, δηλαδή εκεί που χρησιμοποιείται
            το app. Ο υπόμνηση μπαίνει μόνο όταν υπάρχει κάτι να εξηγηθεί. */}
        {(monthStats.workouts > 0 || plannedDates.size > 0) && (
          <div className="mt-2.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-border/40 pt-2.5 text-xs text-muted-foreground">
            {monthStats.workouts > 0 && (
              <span className="flex items-center gap-1.5">
                <span className="flex items-center gap-1" aria-hidden>
                  <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                  <span className="h-2 w-2 rounded-full bg-muted-foreground/60" />
                  <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/60" />
                </span>
                {t('calendar.magnitudeHint')}
              </span>
            )}
            {plannedDates.size > 0 && (
              <span className="flex items-center gap-1.5">
                <span
                  aria-hidden
                  className="h-2 w-2 rounded-full border border-primary bg-transparent"
                />
                {t('calendar.planned')}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Λεπτομέρειες επιλεγμένης ημέρας — key = μέρα ώστε η αλλαγή επιλογής
          να «ανεβαίνει» ξανά αντί να τιναχτεί απότομα το περιεχόμενο. */}
      <section key={selected ?? 'none'} className="animate-rise-in rounded-2xl border border-border/50 bg-card p-4 shadow-elevated">
        {/* Ήταν 11px uppercase muted — η ίδια «eyebrow» βαθμίδα με τις ετικέτες
            των καρτών, ενώ εδώ είναι ο τίτλος του περιεχομένου. */}
        <div className="mb-3 flex items-center gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-medium capitalize">
            {selected
              ? parseDayKey(selected).toLocaleDateString(i18n.resolvedLanguage, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })
              : t('calendar.pickDay')}
          </h2>
          {selected === today && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-primary">
              {t('calendar.today')}
            </span>
          )}
        </div>
        {selected && (
          <div className="mb-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('calendar.planned')}
              </h3>
              <button
                type="button"
                onClick={() => openScheduleSheet(null)}
                className="inline-flex h-11 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary ring-offset-background transition-colors hover:bg-primary/10 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t('calendar.scheduleSession')}
              </button>
            </div>
            {startError && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">
                {startError}
              </p>
            )}
            {dayScheduled.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('calendar.noPlanned')}</p>
            ) : (
              <ul className="space-y-1.5">
                {dayScheduled.map((s) => (
                  <li
                    key={s.id}
                    className={cn(
                      'flex items-center gap-2 rounded-md px-3 py-2',
                      s.status === 'skipped' ? 'bg-muted/20' : 'bg-primary/5',
                    )}
                  >
                    <span
                      aria-hidden
                      className={cn(
                        'h-2 w-2 shrink-0 rounded-full border',
                        s.status === 'planned'
                          ? 'border-primary bg-transparent'
                          : s.status === 'done'
                            ? 'border-transparent bg-primary'
                            : 'border-muted-foreground/50 bg-transparent',
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => openScheduleSheet(s)}
                      className="min-w-0 flex-1 text-left"
                    >
                      <span
                        className={cn(
                          'block truncate text-sm font-medium',
                          s.status === 'skipped' && 'text-muted-foreground line-through',
                        )}
                      >
                        {s.title}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {[s.time, t(`calendar.status.${s.status}`)].filter(Boolean).join(' · ')}
                      </span>
                    </button>
                    {s.status === 'planned' && s.date <= today && (
                      <button
                        type="button"
                        onClick={() => void onStartScheduled(s)}
                        aria-label={t('calendar.sessionStart')}
                        title={t('calendar.sessionStart')}
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-primary transition-colors hover:bg-primary/10"
                      >
                        <Play className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {(!day || day.workouts.length === 0) && (
          <div className="mb-3">
            <p className="text-sm text-muted-foreground">{t('calendar.emptyDay')}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t('calendar.emptyDayHint')}</p>
          </div>
        )}
        {day && day.workouts.length > 0 && (
          <ul className="space-y-2">
            {day.workouts.map((w) => (
              <DayWorkoutRow
                key={w.id}
                id={w.id}
                dotClass={dotOf(w.kind)}
                title={w.label ?? labelOf(w.kind)}
                meta={
                  [
                    w.durationSeconds ? formatHMS(w.durationSeconds) : null,
                    w.sets ? `${w.sets} ${t('history.totalSets')}` : null,
                    w.distanceKm ? `${w.distanceKm} km` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || '—'
                }
              />
            ))}
          </ul>
        )}
        {day?.weight != null && (
          <p className="mt-3 font-mono text-xs text-muted-foreground">
            {t('body.weight')}: {formatWeight(day.weight, unit, { granularity: 'body' })}
          </p>
        )}

        {selected && (
          <div className="mt-3 space-y-2">
            {selected > today && (
              <p className="text-xs text-muted-foreground">{t('calendar.futureBlocked')}</p>
            )}
            <button
              type="button"
              disabled={selected > today || starting}
              onClick={() => void onQuickLogDay()}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-semibold text-primary-foreground ring-offset-background transition-all duration-150 hover:opacity-90 active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <Play className="h-4 w-4" aria-hidden />
              {selected < today ? t('calendar.logForDay') : t('calendar.logToday')}
            </button>
            <button
              type="button"
              disabled={selected > today}
              onClick={() => setAddOpen(true)}
              className="flex h-11 w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-sm font-medium text-muted-foreground ring-offset-background transition-all duration-150 hover:border-foreground/30 hover:bg-accent hover:text-foreground active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {t('calendar.addWorkout')}
            </button>
          </div>
        )}
      </section>

      {/*
        Δύο δρόμοι στην επιλεγμένη μέρα: (a) πρόγραμμα → μέρα → pre-filled
        πλάνο + auto-αρίθμηση, (b) ad-hoc/quick → κενή προπόνηση, ελεύθερη
        προσθήκη ασκήσεων. Ένα sheet, δύο σαφή sections — όχι wizard.
      */}
      <BottomSheet open={addOpen} onClose={closeAddSheet} title={t('calendar.addWorkout')}>
        <div className="space-y-5 px-4 pb-4">
          {startError && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
              {startError}
            </p>
          )}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {t('calendar.pickProgramDay')}
              </h3>
              <button
                type="button"
                onClick={() => void onCreateProgram()}
                className="flex items-center gap-1 text-xs font-medium text-primary hover:opacity-80"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                {t('calendar.newProgram')}
              </button>
            </div>
            {programsWithDays === undefined ? (
              // undefined = φορτώνει, [] = πραγματικά άδειο — δύο διαφορετικά states.
              <div className="space-y-1.5">
                <div className="h-11 animate-pulse rounded-md bg-muted/40" />
                <div className="h-11 animate-pulse rounded-md bg-muted/40" />
              </div>
            ) : programsWithDays.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('calendar.noProgramDays')}</p>
            ) : (
              <div className="space-y-3">
                {programsWithDays.map(({ program, days }) =>
                  days.length > 0 ? (
                    <div key={program.id}>
                      <p className="mb-1 truncate text-xs text-muted-foreground">{program.name}</p>
                      <div className="space-y-1.5">
                        {days.map(({ day: programDay, nextNo, exercises }) => (
                          <button
                            key={programDay.id}
                            disabled={starting}
                            onClick={() => void onPickProgramDay(programDay.id)}
                            className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-left text-sm ring-offset-background transition-all duration-150 hover:bg-muted active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-medium">{programDay.name}</span>
                              <span className="block text-xs text-muted-foreground">
                                {t('calendar.dayExercises', { count: exercises })}
                              </span>
                            </span>
                            <span className="shrink-0 font-mono text-xs text-muted-foreground">
                              #{nextNo}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    // Flat πρόγραμμα: μία επιλογή που ξεκινά ολόκληρο το πρόγραμμα.
                    <button
                      key={program.id}
                      disabled={starting}
                      onClick={() => void onPickProgram(program.id)}
                      className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2.5 text-left text-sm ring-offset-background transition-all duration-150 hover:bg-muted active:scale-[0.99] focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    >
                      <span className="min-w-0 truncate font-medium">{program.name}</span>
                      <Plus className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          <div className="h-px bg-border/70" />

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('calendar.quickStart')}
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">{t('calendar.quickStartHint')}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={starting}
                onClick={() => void onQuickStart(t('calendar.homeBodyweight'), ['Push-ups', 'Pike Push-ups', 'Plank', 'Hollow Body Hold'])}
                className="rounded-xl border border-border/70 bg-muted/30 p-3 text-left transition-colors hover:bg-muted/60 active:scale-[0.99]"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <House className="h-4 w-4 text-primary" aria-hidden />
                  {t('calendar.homeBodyweight')}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t('calendar.homeBodyweightHint')}
                </span>
              </button>
              <button
                type="button"
                disabled={starting}
                onClick={() => void onQuickStart(t('calendar.pullupBar'), ['Pull-ups', 'Dips', 'Hanging Leg Raise', 'L-Sit'])}
                className="rounded-xl border border-border/70 bg-muted/30 p-3 text-left transition-colors hover:bg-muted/60 active:scale-[0.99]"
              >
                <span className="flex items-center gap-2 text-sm font-medium">
                  <ArrowUpFromLine className="h-4 w-4 text-primary" aria-hidden />
                  {t('calendar.pullupBar')}
                </span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {t('calendar.pullupBarHint')}
                </span>
              </button>
            </div>
          </div>

          <div className="h-px bg-border/70" />

          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t('calendar.adHoc')}
            </h3>
            <p className="mb-2 text-xs text-muted-foreground">{t('calendar.adHocHint')}</p>
            {/*
              Πριν: 5 σταθερά activity chips («5 μπαρούφες» — owner feedback).
              Τώρα: ένα πεδίο ελεύθερου κειμένου· ό,τι γράψεις γίνεται το
              label της προπόνησης, χωρίς λίστα προεπιλογών.
            */}
            <form onSubmit={(e) => void onSubmitAdHoc(e)} className="flex gap-2">
              <Input
                value={adHocLabel}
                onChange={(e) => setAdHocLabel(e.target.value)}
                placeholder={t('workout.typePlaceholder')}
                className="h-11 flex-1"
              />
              <button
                type="submit"
                disabled={!adHocLabel.trim() || starting}
                aria-label={t('calendar.adHocStart')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground ring-offset-background transition-all duration-150 hover:opacity-90 active:scale-95 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:opacity-40"
              >
                <Plus className="h-4 w-4" />
              </button>
            </form>
          </div>

          <div className="h-px bg-border/70" />

          <button
            type="button"
            disabled={!selected || selected > today}
            onClick={() => {
              runAfterSheetClose(() => setPasteOpen(true));
              closeAddSheet();
            }}
            className="flex w-full items-start gap-3 rounded-xl border border-primary/30 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10 active:scale-[0.99] disabled:opacity-40"
          >
            <ClipboardPaste className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">
                {t('calendar.pasteWorkout')}
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                {t('calendar.pasteWorkoutHint')}
              </span>
            </span>
          </button>
        </div>
      </BottomSheet>

      <QuickPasteWorkoutSheet
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        initialDate={selected ?? today}
        onSaved={(res) => runAfterSheetClose(() => navigate(`/history/${res.workoutId}`))}
      />

      {scheduleOpen && (
        <ScheduledSessionSheet
          key={editingSession?.id ?? `new-${selected ?? today}`}
          onClose={closeScheduleSheet}
          date={editingSession?.date ?? selected ?? today}
          session={editingSession}
          programs={schedulablePrograms}
          activities={activities}
          onStart={onStartScheduled}
        />
      )}
    </div>
  );
}
