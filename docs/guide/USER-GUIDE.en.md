# Anabasis — user guide

How to log, correct and use your data. The in-app version is at **/guide** and
uses the same button names you see in the app.

## Log a workout

1. Open **Calendar**, pick a day (today or earlier), tap **Add workout**.
2. Choose a program day, or type a free name for an ad-hoc session, tap **Start**.
3. Tap **Add exercise**, pick from the library or type a new name. Set weight
   and reps, tap **Add set** for every set.
4. **Quick log** records a whole exercise in one line.
5. **Paste notes** imports many exercises, one per line. Review the preview,
   then save.
6. Tap **Save workout** and confirm. The session opens in History.

Accepted one-line formats (Quick log):

```
80 5,4,3,2
80kg 1 + 90kg 1 + 100kg 1
30kg 5+4+3(drop set 10kg 7)
18kg 4xmax
```

Paste notes examples:

```
Bench Press: 80kg 5+5
Weighted Pull-ups: 20kg 4x5
Pull-ups: bw 8+6+5
```

Warm-up sets never count toward PRs. A session with no sets does not create a
workout.

## Fix or delete a finished workout

1. Open **History** and tap the workout.
2. **Edit** on a set changes weight, reps, RPE/RIR, tempo or notes; **Save**.
3. **Repeat set** copies the last set; the bin removes a set. The “Set deleted”
   toast offers **Undo**.
4. **Remove exercise** removes all its sets after a confirm; the toast offers
   **Undo**.
5. **Edit workout** changes name, date, start/end time, duration or notes.
   **Delete this workout** asks for confirmation; **Undo** in the toast restores
   it.

Deleting a workout hides its sets and recomputes the PRs of the affected
exercises.

## Exercises, programs, goals and skills

- **Exercises:** **New exercise**, set category/equipment and Weighted or
  Bodyweight. **Archive** hides it from the picker without breaking history;
  delete works only when it has no history.
- **Programs:** **New program**, add days and exercises with target
  sets/reps/weight. **Duplicate** forks a program; start it from its page or
  from Calendar.
- **Goals:** **New goal**, pick what to count (sessions, volume, sets, reps,
  distance, duration, skill steps, target weight or a custom tracker), amount
  and period.
- **Skills:** **New skill**, add ordered steps with targets, **Mark achieved**
  when you clear one. Archive instead of deleting a skill that has progress.
- **Archive/Restore** hides things without losing history.

## Body measurements

1. Open **Body**, choose a date (today or earlier), fill Weight / Body fat /
   Steps, tap **Save**.
2. **Edit entry** loads that day into the form for corrections.
3. **Clear entry** removes that day's values; confirm **Delete this
   measurement?**.
4. **Weight trend**, **Body fat trend** and **Steps** charts appear once there
   is enough data.

Bodyweight counts as load in bodyweight exercises.

## Plan sessions on the calendar

1. In **Calendar** pick a day, tap **Schedule session**. Add a title, optional
   time/program, save.
2. **Repeat weekly** creates the same session for several weeks at once.
3. Tap a planned session to edit it, **Skip** it, or delete it with confirmation.
4. For today, **Start now** opens the logger; saving turns the session into
   **Done**. **Today in your plan** on Home lists today's planned sessions.

## What the charts mean

- **Progress per exercise:** **Top set** is the heaviest working set; **Est.
  1RM** estimates a one-rep max from weight and reps; **Volume** is weight ×
  reps. Reps are shown per session.
- **Training analytics:** **Weekly volume** sums working sets (bodyweight counts
  as load); **Sessions per week** counts completed workouts; **Sets per
  category** splits working sets by category; **PR timeline** adds records
  cumulatively.
- **History** shows volume trends and recent PRs; feel is logged per session.
- **Body** charts cover weight, body fat and steps. Choose a range
  (1M/3M/6M/1Y/All) to change the window.

A chart needs at least two sessions of an exercise to show a trend.

## Personal records

- Strength PRs: **Max weight**, **Max reps**, **Max volume**, **Est. 1RM**,
  **Max hold**. Activities without sets track **Longest distance**, **Longest
  duration** and **Fastest pace**.
- Warm-up sets never count. The first ever set of a new exercise is not
  celebrated as a PR because there was no previous mark.
- For bodyweight exercises, volume counts bodyweight + added weight; **Max
  weight** and **Est. 1RM** count only the added weight. A set with no added
  weight can still set volume or rep records.
- After editing, repeating or deleting sets (or deleting a workout), PRs are
  recomputed from the remaining live sets, so wrong old marks do not stick.

## Offline and sync

1. Data lives in this browser's IndexedDB on this device. Closing the tab does
   not erase it.
2. Offline, logging and edits keep working; the offline banner reminds you and
   changes sync after reconnect.
3. To sync the active device profile, sign in from **Account & Sync**. Device
   profiles are local sets of data, not accounts.
4. Each device profile has its own settings and data; switching changes what
   you see.

## Backup, import, CSV and deletion

1. **Settings → Data & backups** shows counts for the active profile.
2. **Export this profile** downloads a JSON backup of the active profile;
   **Export all profiles on this device** includes every profile on the device.
3. **Workouts (CSV)** and **Sets (CSV)** are for spreadsheets; CSV is for
   analysis, not for restoring.
4. **Import backup** shows a preview of what will be added or updated before
   anything is written. Importing merges; it does not wipe first.
5. **Check now** finds orphan rows and **Repair** fixes them without deleting
   planned sessions.
6. **Delete all data** removes the active profile's data after two
   confirmations. Export a backup first.

Deleting a device profile also offers a JSON backup before deletion in
**Profiles**.
