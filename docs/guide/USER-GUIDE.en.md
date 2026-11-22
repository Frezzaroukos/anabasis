# Anabasis — user guide

How to log, correct and use your data. The in-app version is at **/guide** and
uses the same button names you see in the app.

## Log a workout

1. Tap **Start workout** on Home for today. For an earlier day open **Calendar**
   and tap **Add workout**.
2. Choose a program day, or type a free name for an ad-hoc session, tap **Start**.
3. Tap **Add exercise**. **Recent** chips skip typing; the previous weight and
   reps are pre-filled — adjust them or keep them.
4. Set weight and reps, tap **Add set**. Rest starts automatically (**Auto**);
   use −15/+15 or tap **Auto** to turn it off. **+1 same** repeats the last set.
5. **Quick log** records one exercise in one line; **Paste notes** handles a
   whole session (next section).
6. Tap **Save workout** and confirm **End workout?**. The summary shows
   exercises, sets and PRs; rest end beeps/vibrates when notifications are on.

Accepted one-line formats (Quick log):

```
80 5,4,3,2
80kg 1 + 90kg 1 + 100kg 1
30kg 5+4+3(drop set 10kg 7)
18kg 4xmax
```

Warm-up sets never count toward PRs. A session with no sets does not create a
workout.

## Quick paste notes

1. Open **Paste notes** from an exercise, or **Paste** on Home.
2. Paste one exercise per line, e.g. `Bench Press: 80kg 5+5`. When creating a
   workout you can set its date and name.
3. The preview guesses each exercise. Fix it with **Match exercise**; your
   correction is remembered next time. “Exercise guessed — check the match
   above.” means a fuzzy match.
4. Correct numbers inline under **Sets (edit if wrong)**. Drop sets and AMRAP
   are labelled on the chips.
5. Untick lines with the red “Couldn’t read any valid set…” or amber “Check
   numbers…” message, then save with the count button.

Nothing is written until you save. Match memory stays on this device.

Paste examples:

```
Bench Press: 80kg 5+5
Weighted Pull-ups: 20kg 4x5
Pull-ups: bw 8+6+5
```

## Fix or delete a finished workout

1. Use **Search history…**, filter **By exercise** or by date, group by
   **Month**/**Week**, and reset with **Clear filters**.
2. Open a workout. **Edit** and **Save** a set; **Repeat set** copies it; the
   bin deletes it with Undo. **Remove exercise** removes all its sets with Undo.
3. **Adjust weight for this exercise** changes every working set at once:
   choose **Add / subtract** or **Set to**, then **Apply**.
4. **Copy to another date** creates a full copy on the chosen date. If a
   workout already exists there, the app tells you.
5. **Edit workout** changes name, date, start/end time, duration or notes.
   **Delete this workout** asks for confirmation; Undo in the toast restores it.
6. After edits or deletes, PRs are recomputed from the remaining live sets.

Deleting a workout hides its sets and recomputes the PRs of the affected
exercises.

## Home in one tap

- **Start workout** starts today’s session. If one is active it becomes
  **Continue workout**.
- If you planned a session for today, the button starts that instead. With no
  plan it starts an empty strength session.
- **Weight** opens **Log weight**, pre-filled with your last value.
- **Last workout** opens the latest session. **Paste** imports notes for today.
  **Today in your plan** lists today’s planned sessions.

## Exercises, programs and goals

- **Exercises:** **New exercise** sets category, equipment and Weighted or
  Bodyweight. **Archive** hides it without breaking history; **Delete
  exercise** works only without history.
- Filter by **Used**/**Unused**, choose a **Filter by category** and a **Sort
  by** order.
- **Merge into another exercise** moves all sets, records and history and
  archives the source. For possible duplicates use **Merge into selected**;
  copies are archived and can be restored.
- **Programs:** **New program**, add days and exercises with target
  sets/reps/weight. **Duplicate** forks a program.
- **Goals:** **New goal** and pick what to count, amount and period.
- Use Archive/Restore to hide things without losing history.

## Skills and progressions

1. **New skill**, then **Add step** for each stage with its target. **Edit
   step** fixes a name, target or benchmark video.
2. The header shows **Current step**, **Next target** and **Last achieved**.
3. **Move step up**/**Move step down** reorder the ladder and rebuild the
   prerequisites. **Undo mark achieved** reverts a wrong tap.
4. **Mark achieved** saves the value and optional added weight, then moves the
   current step to the next one. Archive instead of deleting a skill with
   progress.

## Activities (run, bike, swim…)

1. **New activity** creates a custom sport. Turn **Logs sets** off for
   time/distance sports so the logger asks for distance and duration.
2. For non-set activities tap **Start** in Activities, enter distance and
   Duration (`25`, `25:30` or `1:05:00`); pace updates as you type.
3. **Edit activity** changes name, icon and colour. **Delete activity** asks
   for confirmation and offers Undo in the toast.

Leave Duration empty to use the live timer. Distance must be above 0 and
duration up to 24 hours.

## Body measurements

1. Tap **Weight** on Home, adjust the pre-filled value with **Decrease
   weight**/**Increase weight**, then **Save**.
2. On Body, choose a date (today or earlier), fill **Weight** / **Body fat** /
   **Steps** and tap **Save**.
3. In **Recent entries** tap **Edit entry** to correct a day.
4. **Clear entry** removes that day’s values; confirm **Delete this
   measurement?**.
5. “Last entry — adjust it or save it” means the form is pre-filled from last
   time. **Weight trend** and the body fat/steps charts appear with enough data.

Bodyweight counts as load in bodyweight exercises.

## Plan sessions on the calendar

1. In **Calendar** pick a day and tap **Schedule session**. Add a title,
   optional time/program, save.
2. **Repeat weekly** creates the same session for several weeks at once.
3. Tap a planned session for **Edit planned session**, **Skip** or delete with
   confirmation.
4. Use **Start today** / **Log for this day** under the selected day; an empty
   day says “Nothing logged for this day.” Delete a workout from its row —
   “Workout deleted” offers Undo. Starting today’s plan and saving marks it
   **Done**.

## What the charts mean

- **Progress per exercise:** **Top set**, **Est. 1RM**, **Volume**, **Hold**
  and **Reps**. Bodyweight charts say “≈ estimated from latest body weight”
  when load uses bodyweight.
- **Consistency** is a heatmap: each square is a day and darker means more
  sessions.
- **Training analytics:** **Weekly volume**, **Sessions per week**, **Sets per
  category**, **Weekly sets by category**, **Skill progress** and **PR
  timeline**.
- History shows volume trends, feel and recent PRs; body charts cover weight,
  body fat and steps. Choose **Time range** (1M/3M/6M/1Y/All).

A chart needs at least two sessions of an exercise to show a trend.

## Personal records

- Strength PRs: **Max weight**, **Max reps**, **Max volume**, **Est. 1RM**,
  **Max hold**. Activities without sets track **Longest distance**, **Longest
  duration** and **Fastest pace**.
- Warm-up sets never count. The first ever set of a new exercise is not
  celebrated as a PR because there was no previous mark.
- Bodyweight load = bodyweight + added weight; **Max weight** and **Est. 1RM**
  count only added weight. A bodyweight set can still set volume/rep records.
- After editing, repeating or deleting sets (or deleting a workout), PRs are
  recomputed from the remaining live sets.

## Offline and sync

1. Data lives in this browser’s IndexedDB on this device. Closing the tab does
   not erase it.
2. Offline, logging and edits keep working; the offline banner reminds you and
   changes sync after reconnect.
3. To sync the active device profile, sign in from **Account & Sync**. Device
   profiles are local sets of data, not accounts.

## Backup, import, CSV and deletion

1. **Settings → Data & backups** shows counts for the active profile.
2. **Export this profile** downloads a JSON backup; **Export all profiles on
   this device** includes every profile.
3. **Workouts (CSV)** and **Sets (CSV)** are for spreadsheets, not restoring.
4. **Import backup** shows a preview before anything is written; importing
   merges, it does not wipe first.
5. **Check now** finds orphan rows and **Repair** fixes them without deleting
   planned sessions.
6. **Delete all data** removes the active profile’s data after two
   confirmations. Export a backup first.

Deleting a device profile also offers a JSON backup before deletion in
**Profiles**.

## Quick tricks

1. **+1 same** repeats the last set in one tap — three sets at 80 kg need one
   tap per extra set.
2. Quick log multipliers: `18kg 4xmax` creates four AMRAP sets, `80kg 3x5`
   three sets of five.
3. Paste a whole session with **Paste notes**; correct a guessed exercise once
   and it is remembered.
4. From Home: **Start workout** for today, **Weight** for a pre-filled weigh-in.
5. Rest controls: −15/+15 seconds, or tap **Auto** to switch to a manual timer.
6. **Copy to another date** repeats a workout; **Merge into another exercise**
   fixes duplicates; **Log for this day** backfills an earlier day.
