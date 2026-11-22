/**
 * Δεδομένα του in-app οδηγού. Κάθε κείμενο είναι i18n key (EN/EL) και κάθε
 * ενότητα δηλώνει τα ΠΡΑΓΜΑΤΙΚΑ labels κουμπιών που αναφέρει, ώστε το test
 * να αποτυγχάνει αν ένα label μετονομαστεί ή εξαφανιστεί.
 */
export interface GuideSection {
  id: string;
  titleKey: string;
  introKey: string;
  stepKeys: string[];
  labelKeys: string[];
  noteKey?: string;
  examples?: boolean;
}

export const QUICK_LOG_EXAMPLES = [
  '80 5,4,3,2',
  '80kg 1 + 90kg 1 + 100kg 1',
  '30kg 5+4+3(drop set 10kg 7)',
  '18kg 4xmax',
] as const;

export const PASTE_EXAMPLES = [
  'Bench Press: 80kg 5+5',
  'Weighted Pull-ups: 20kg 4x5',
  'Pull-ups: bw 8+6+5',
] as const;

export const GUIDE_SECTIONS: GuideSection[] = [
  {
    id: 'record',
    titleKey: 'guide.sections.record.title',
    introKey: 'guide.sections.record.intro',
    stepKeys: [1, 2, 3, 4, 5, 6].map((n) => `guide.sections.record.step${n}`),
    labelKeys: [
      'calendar.addWorkout',
      'calendar.adHocStart',
      'workout.addExercise',
      'workout.addSet',
      'workout.quickLog',
      'workout.pasteNotes',
      'workout.saveWorkout',
      'workout.endConfirmTitle',
    ],
    noteKey: 'guide.sections.record.note',
    examples: true,
  },
  {
    id: 'correct',
    titleKey: 'guide.sections.correct.title',
    introKey: 'guide.sections.correct.intro',
    stepKeys: [1, 2, 3, 4, 5].map((n) => `guide.sections.correct.step${n}`),
    labelKeys: [
      'history.title',
      'common.edit',
      'workout.save',
      'workout.duplicateSet',
      'workout.removeExercise',
      'history.undo',
      'history.editWorkout',
      'history.deleteWorkout',
    ],
    noteKey: 'guide.sections.correct.note',
  },
  {
    id: 'library',
    titleKey: 'guide.sections.library.title',
    introKey: 'guide.sections.library.intro',
    stepKeys: [1, 2, 3, 4, 5].map((n) => `guide.sections.library.step${n}`),
    labelKeys: [
      'exercises.new',
      'exercises.archive',
      'exercises.deleteExercise',
      'programs.newProgram',
      'programs.duplicate',
      'goals.new',
      'goals.archive',
      'skills.newSkill',
      'skills.addStep',
      'skills.markAchieved',
      'skills.archive',
    ],
  },
  {
    id: 'body',
    titleKey: 'guide.sections.body.title',
    introKey: 'guide.sections.body.intro',
    stepKeys: [1, 2, 3, 4].map((n) => `guide.sections.body.step${n}`),
    labelKeys: [
      'body.title',
      'body.weight',
      'body.bodyFat',
      'body.steps',
      'body.save',
      'body.editEntry',
      'body.clearEntry',
      'body.deleteEntryTitle',
      'body.recentEntries',
      'body.weightTrend',
    ],
  },
  {
    id: 'planner',
    titleKey: 'guide.sections.planner.title',
    introKey: 'guide.sections.planner.intro',
    stepKeys: [1, 2, 3, 4].map((n) => `guide.sections.planner.step${n}`),
    labelKeys: [
      'calendar.scheduleSession',
      'calendar.editScheduled',
      'calendar.sessionStart',
      'calendar.sessionSkip',
      'calendar.sessionDeleteTitle',
      'dashboard.scheduledToday',
      'calendar.status.done',
    ],
  },
  {
    id: 'charts',
    titleKey: 'guide.sections.charts.title',
    introKey: 'guide.sections.charts.intro',
    stepKeys: [1, 2, 3, 4].map((n) => `guide.sections.charts.step${n}`),
    labelKeys: [
      'progress.topWeight',
      'progress.e1rm',
      'progress.volume',
      'progress.analytics.weeklyVolume',
      'progress.analytics.frequency',
      'progress.analytics.categories',
      'progress.analytics.prTimeline',
      'progress.rangeLabel',
    ],
    noteKey: 'guide.sections.charts.note',
  },
  {
    id: 'prs',
    titleKey: 'guide.sections.prs.title',
    introKey: 'guide.sections.prs.intro',
    stepKeys: [1, 2, 3, 4].map((n) => `guide.sections.prs.step${n}`),
    labelKeys: [
      'history.pr.max_weight',
      'history.pr.max_reps',
      'history.pr.max_volume',
      'history.pr.e1rm',
      'history.pr.max_hold',
      'history.pr.longest_distance',
      'history.pr.longest_duration',
      'history.pr.fastest_pace',
    ],
  },
  {
    id: 'sync',
    titleKey: 'guide.sections.sync.title',
    introKey: 'guide.sections.sync.intro',
    stepKeys: [1, 2, 3, 4].map((n) => `guide.sections.sync.step${n}`),
    labelKeys: [
      'settings.account',
      'settings.deviceProfiles',
      'common.offline',
      'common.offlineHint',
      'account.title',
    ],
  },
  {
    id: 'backup',
    titleKey: 'guide.sections.backup.title',
    introKey: 'guide.sections.backup.intro',
    stepKeys: [1, 2, 3, 4, 5, 6].map((n) => `guide.sections.backup.step${n}`),
    labelKeys: [
      'settings.data',
      'settings.exportProfile',
      'settings.exportAllProfiles',
      'settings.exportWorkoutsCsv',
      'settings.exportSetsCsv',
      'settings.import',
      'settings.integrityCheck',
      'settings.deleteAll',
      'profile.delete',
    ],
    noteKey: 'guide.sections.backup.note',
  },
];
