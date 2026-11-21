import { describe, expect, it } from 'vitest';
import { db } from './index';
import { setCurrentUserId } from './session';
import {
  createProgram,
  createProgramDay,
  endWorkout,
  localDay,
  softDeleteWorkout,
} from './queries';
import {
  createRecurringScheduledSessions,
  createScheduledSession,
  deleteScheduledSession,
  listScheduledForDay,
  listScheduledSessions,
  setScheduledSessionStatus,
  startScheduledSession,
  updateScheduledSession,
  weeklyDates,
} from './scheduledSessions';

/**
 * Planner queries: τοπικές ημέρες, soft delete, εβδομαδιαία επανάληψη και η
 * σύνδεση planned → workout (start/end/delete). Κάθε test έχει δικό του user
 * ώστε το «ενεργή προπόνηση» guard και τα range queries να μην μπλέκονται.
 */
describe('scheduledSessions', () => {
  it('weeklyDates: +7 τοπικές ημέρες, χωρίς μετατόπιση σε DST/αλλαγή μήνα/έτους', () => {
    // 2026-03-29 είναι η αλλαγή ώρας στην Ευρώπη — η τοπική ημέρα δεν πρέπει
    // να «γλιστρήσει» σε 28/30.
    expect(weeklyDates('2026-03-28', 3)).toEqual(['2026-03-28', '2026-04-04', '2026-04-11']);
    expect(weeklyDates('2026-12-28', 2)).toEqual(['2026-12-28', '2027-01-04']);
    expect(weeklyDates('2026-03-28', 0)).toEqual(['2026-03-28']); // clamp min 1
    expect(weeklyDates('2026-03-28', 999)).toHaveLength(52); // clamp max 52
  });

  it('create + list by range: endpoints μέσα, ταξινόμηση ώρας, isolation ανά user', async () => {
    setCurrentUserId('planner-crud');
    await createScheduledSession({ date: '2026-03-10', time: '18:00', title: 'Evening' });
    await createScheduledSession({ date: '2026-03-10', time: '09:00', title: 'Morning' });
    await createScheduledSession({ date: '2026-03-12', title: 'No time' });

    const inRange = await listScheduledSessions('2026-03-10', '2026-03-12');
    expect(inRange.map((s) => s.title)).toEqual(['Morning', 'Evening', 'No time']);
    expect(await listScheduledSessions('2026-03-11', '2026-03-11')).toEqual([]);
    expect(await listScheduledForDay('2026-03-10')).toHaveLength(2);

    setCurrentUserId('planner-crud-other');
    expect(await listScheduledSessions('2026-03-01', '2026-03-31')).toEqual([]);
  });

  it('update αλλάζει πεδία/status και κρατά την τοπική ημερομηνία', async () => {
    setCurrentUserId('planner-update');
    const s = await createScheduledSession({ date: '2026-04-01', title: 'Old' });

    await updateScheduledSession(s.id, {
      title: 'New',
      time: '07:30',
      date: '2026-04-02',
      status: 'skipped',
    });

    const [row] = await listScheduledForDay('2026-04-02');
    expect(row).toMatchObject({ id: s.id, title: 'New', time: '07:30', status: 'skipped' });

    await setScheduledSessionStatus(s.id, 'planned');
    expect((await listScheduledForDay('2026-04-02'))[0]!.status).toBe('planned');
  });

  it('delete είναι soft: το row μένει στη βάση ως tombstone αλλά εξαφανίζεται από τη λίστα', async () => {
    setCurrentUserId('planner-delete');
    const s = await createScheduledSession({ date: '2026-04-05', title: 'Gone' });

    await deleteScheduledSession(s.id);

    expect(await listScheduledForDay('2026-04-05')).toEqual([]);
    const raw = await db.scheduled_sessions.get(s.id);
    expect(raw?.deleted_at).not.toBeNull();
  });

  it('recurring: N rows, μία ανά εβδομάδα, όλες planned', async () => {
    setCurrentUserId('planner-recurring');
    const rows = await createRecurringScheduledSessions(
      { date: '2026-03-28', time: '18:00', title: 'Weekly Upper' },
      3,
    );
    expect(rows.map((r) => r.date)).toEqual(['2026-03-28', '2026-04-04', '2026-04-11']);
    expect(rows.every((r) => r.status === 'planned')).toBe(true);
    expect(await listScheduledSessions('2026-03-01', '2026-04-30')).toHaveLength(3);
  });

  it('start ad-hoc → workout linked, endWorkout → done, διαγραφή workout → πίσω σε planned', async () => {
    setCurrentUserId('planner-start-adhoc');
    const s = await createScheduledSession({
      date: localDay(),
      title: 'Ad-hoc plan',
      activity_kind: 'strength',
    });

    const res = await startScheduledSession(s);
    expect(res).not.toBeNull();
    const workout = await db.workouts.get(res!.workoutId);
    expect(workout?.workout_type).toBe('Ad-hoc plan');
    expect(workout?.deleted_at).toBeNull();

    let row = (await listScheduledForDay(s.date))[0]!;
    expect(row!.workout_id).toBe(res!.workoutId);
    expect(row!.status).toBe('planned');

    // Δεύτερο start πριν το end: επιστρέφει το ΙΔΙΟ ενεργό workout.
    const again = await startScheduledSession(row!);
    expect(again?.workoutId).toBe(res!.workoutId);
    expect(await db.workouts.where('user_id').equals('planner-start-adhoc').count()).toBe(1);

    await endWorkout(res!.workoutId);
    row = (await listScheduledForDay(s.date))[0]!;
    expect(row!.status).toBe('done');
    expect(await startScheduledSession(row!)).toBeNull();

    await softDeleteWorkout(res!.workoutId);
    row = (await listScheduledForDay(s.date))[0]!;
    expect(row!.status).toBe('planned');
    expect(row!.workout_id).toBeNull();
  });

  it('start από program day κρατά program_id/program_day_id στο workout', async () => {
    setCurrentUserId('planner-start-program');
    const program = await createProgram('Planner Split');
    const day = await createProgramDay(program.id, 'Upper');
    const s = await createScheduledSession({
      date: localDay(),
      title: 'Upper',
      program_id: program.id,
      program_day_id: day.id,
    });

    const res = await startScheduledSession(s);
    expect(res).not.toBeNull();
    const workout = await db.workouts.get(res!.workoutId);
    expect(workout?.program_id).toBe(program.id);
    expect(workout?.program_day_id).toBe(day.id);
  });

  it('δεν ξεκινά μελλοντικό, done ή deleted session', async () => {
    setCurrentUserId('planner-guards');
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 3);
    const future = await createScheduledSession({ date: localDay(futureDate), title: 'Future' });
    expect(await startScheduledSession(future)).toBeNull();
    expect((await listScheduledForDay(future.date))[0]!.workout_id).toBeNull();

    const done = await createScheduledSession({ date: localDay(), title: 'Done' });
    await setScheduledSessionStatus(done.id, 'done');
    expect(await startScheduledSession({ ...done, status: 'done' })).toBeNull();

    const deleted = await createScheduledSession({ date: localDay(), title: 'Deleted' });
    await deleteScheduledSession(deleted.id);
    expect(await startScheduledSession({ ...deleted, deleted_at: new Date().toISOString() })).toBeNull();
  });
});
