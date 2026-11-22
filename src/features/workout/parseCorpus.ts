/**
 * Corpus ρεαλιστικών γραμμών Quick Paste + αναμενόμενο αποτέλεσμα.
 * Πηγές: οι μορφές του parseWorkoutNotes.test (σημειώσεις 19/11) και λογικές
 * παραλλαγές. `sets` = [kg|null, reps|null]· `suspect` = πρέπει να σημαδευτεί.
 * Για hold ασκήσεις τα «reps» είναι δευτερόλεπτα (όπως στο QuickSet).
 */
export interface CorpusCase {
  line: string;
  /** Όνομα άσκησης της βιβλιοθήκης (ή null = δεν ταιριάζει/νέα). */
  exercise: string | null;
  sets: Array<[number | null, number | null]>;
  suspect?: boolean;
}

const rep = (kg: number | null, reps: number | null, n: number): Array<[number | null, number | null]> =>
  Array.from({ length: n }, () => [kg, reps]);

export const CORPUS: CorpusCase[] = [
  { line: 'Bench: 90kg 1 + 100kg 1', exercise: 'Bench Press', sets: [[90, 1], [100, 1]] },
  { line: 'Rows machine για SAT: 18kg 4xmax', exercise: 'Front Lever Row', sets: rep(18, null, 4) },
  { line: 'Bench 80kg 5+5', exercise: 'Bench Press', sets: rep(80, 5, 2) },
  { line: 'Pull ups: bw 5+4+3', exercise: 'Pull-ups', sets: [[null, 5], [null, 4], [null, 3]] },
  { line: 'Dips: 30kg 5+4+3(drop set 10kg 7)', exercise: 'Dips', sets: [[30, 5], [30, 4], [30, 3], [10, 7]] },
  { line: 'OHP: 26kg 2,5+1(drop set 18kg 10)', exercise: 'Overhead Press', sets: [[26, 2.5], [26, 1], [18, 10]] },
  { line: 'Squat 100 5,5,5', exercise: 'Back Squat', sets: rep(100, 5, 3) },
  { line: 'Bw Mu :2+1+1+1', exercise: 'Muscle Up', sets: [[null, 2], [null, 1], [null, 1], [null, 1]] },
  { line: 'Έλξεις 4x8', exercise: 'Pull-ups', sets: rep(null, 8, 4) },
  { line: 'Dips +20kg 3x6', exercise: 'Dips', sets: rep(20, 6, 3) },
  { line: 'Planche lean 3x20s', exercise: 'Planche Lean', sets: rep(null, 20, 3) },
  { line: 'L-sit 15″ 12″ 10″', exercise: 'L-Sit', sets: [[null, 15], [null, 12], [null, 10]] },
  { line: 'Push ups bw 3x12', exercise: 'Push-ups', sets: rep(null, 12, 3) },
  { line: 'Dips BW+10 3x6', exercise: 'Dips', sets: rep(10, 6, 3) },
  { line: 'Squat 3x5 @80', exercise: 'Back Squat', sets: rep(80, 5, 3) },
  { line: 'Pull-ups 5/5/4', exercise: 'Pull-ups', sets: [[null, 5], [null, 5], [null, 4]] },
  { line: 'Deadlift 100x3x2', exercise: 'Deadlift', sets: rep(100, 3, 2) },
  { line: 'Bench 135lb 5x5', exercise: 'Bench Press', sets: rep(61.2, 5, 5) },
  { line: 'Bench 80 κιλά 3x8', exercise: 'Bench Press', sets: rep(80, 8, 3) },
  { line: 'Biceps curl 22,5kg 3x10', exercise: 'Biceps Curls', sets: rep(22.5, 10, 3) },
  { line: 'Bench: 80kg 5+4+3 (felt heavy)', exercise: 'Bench Press', sets: [[80, 5], [80, 4], [80, 3]] },
  { line: 'Pull-ups 3x8 (wide grip)', exercise: 'Pull-ups', sets: rep(null, 8, 3) },
  { line: 'Καθίσματα 100kg 5x5', exercise: 'Back Squat', sets: rep(100, 5, 5) },
  { line: 'Πιέσεις ώμων 40kg 8,8,6', exercise: 'Overhead Press', sets: [[40, 8], [40, 8], [40, 6]] },
  { line: 'Βυθίσεις 3x10', exercise: 'Dips', sets: rep(null, 10, 3) },
  { line: 'Handstand 3x30s', exercise: 'Handstand', sets: rep(null, 30, 3) },
  { line: 'Face pulls 3x15 20kg', exercise: 'Face Pull', sets: rep(20, 15, 3) },
  { line: 'Lateral raise 8kg 3x12', exercise: 'Lateral Raise', sets: rep(8, 12, 3) },
  { line: 'Hanging leg raise 4x10', exercise: 'Hanging Leg Raise', sets: rep(null, 10, 4) },
  { line: 'Ab wheel 3x10', exercise: 'Ab Wheel Rollout', sets: rep(null, 10, 3) },
  { line: 'RDL 80kg 3x8', exercise: 'Romanian Deadlift', sets: rep(80, 8, 3) },
  { line: 'Bulgarian split squat 20kg 3x10 each', exercise: 'Bulgarian Split Squat', sets: rep(20, 10, 3) },
  { line: 'Chin ups 3x6 bw', exercise: 'Chin-ups', sets: rep(null, 6, 3) },
  { line: 'Front lever 4x10s', exercise: 'Front Lever', sets: rep(null, 10, 4) },
  { line: 'Nordic curl 3x5', exercise: 'Nordic Curl', sets: rep(null, 5, 3) },
  { line: 'Push-ups: 20 15 12', exercise: 'Push-ups', sets: [[null, 20], [null, 15], [null, 12]] },
  { line: 'Dips 4×8', exercise: 'Dips', sets: rep(null, 8, 4) },
  { line: 'Bench 100kg x5', exercise: 'Bench Press', sets: rep(100, 5, 1) },
  { line: 'Pull ups 10,8,6,5', exercise: 'Pull-ups', sets: [[null, 10], [null, 8], [null, 6], [null, 5]] },
  { line: 'Ring dips 3x5', exercise: 'Ring Dips', sets: rep(null, 5, 3) },
  { line: 'Overhead press 30kg 3x8, 25kg 1x10', exercise: 'Overhead Press', sets: [...rep(30, 8, 3), [25, 10]] },
  { line: 'Bench 80kg 3 sets of 8', exercise: 'Bench Press', sets: rep(80, 8, 3) },
  { line: 'Deadlift 140kg 5, 150kg 3, 160kg 1', exercise: 'Deadlift', sets: [[140, 5], [150, 3], [160, 1]] },
  { line: 'Bench 900kg 5', exercise: 'Bench Press', sets: rep(900, 5, 1), suspect: true },
  { line: 'Bench 80kg 0', exercise: 'Bench Press', sets: [], suspect: true },
];
