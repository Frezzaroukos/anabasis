import { lazy } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';

/**
 * Κάθε σελίδα φορτώνεται lazy: το recharts (~χαμηλά εκατοντάδες KB) και οι
 * βαριές σελίδες μπαίνουν σε ξεχωριστά chunks, ώστε το πρώτο άνοιγμα να
 * κατεβάζει μόνο ό,τι χρειάζεται η αρχική. Named exports → μεταφράζονται
 * σε default μέσα στο import.
 */
const lazyPage = <T extends Record<string, React.ComponentType<unknown>>>(
  loader: () => Promise<T>,
  name: keyof T,
) => lazy(() => loader().then((m) => ({ default: m[name] })));

const DashboardPage = lazyPage(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage');
const ActiveWorkoutRoute = lazyPage(() => import('@/features/workout/ActiveWorkoutRoute'), 'ActiveWorkoutRoute');
const ExerciseDetailPage = lazyPage(() => import('@/features/exercises/ExerciseDetailPage'), 'ExerciseDetailPage');
const ProgramsPage = lazyPage(() => import('@/features/programs/ProgramsPage'), 'ProgramsPage');
const ProgramDetailPage = lazyPage(() => import('@/features/programs/ProgramDetailPage'), 'ProgramDetailPage');
const ExercisesPage = lazyPage(() => import('@/features/exercises/ExercisesPage'), 'ExercisesPage');
const ActivitiesPage = lazyPage(() => import('@/features/activities/ActivitiesPage'), 'ActivitiesPage');
const HistoryPage = lazyPage(() => import('@/features/history/HistoryPage'), 'HistoryPage');
const CalendarPage = lazyPage(() => import('@/features/calendar/CalendarPage'), 'CalendarPage');
const BodyPage = lazyPage(() => import('@/features/body/BodyPage'), 'BodyPage');
const ProgressPage = lazyPage(() => import('@/features/progress/ProgressPage'), 'ProgressPage');
const SkillsPage = lazyPage(() => import('@/features/skills/SkillsPage'), 'SkillsPage');
const SkillDetailPage = lazyPage(() => import('@/features/skills/SkillDetailPage'), 'SkillDetailPage');
const SettingsPage = lazyPage(() => import('@/features/settings/SettingsPage'), 'SettingsPage');
const AccountSettingsPage = lazyPage(() => import('@/features/settings/pages/AccountSettingsPage'), 'AccountSettingsPage');
const AppearanceSettingsPage = lazyPage(() => import('@/features/settings/pages/AppearanceSettingsPage'), 'AppearanceSettingsPage');
const TrainingSettingsPage = lazyPage(() => import('@/features/settings/pages/TrainingSettingsPage'), 'TrainingSettingsPage');
const DataSettingsPage = lazyPage(() => import('@/features/settings/pages/DataSettingsPage'), 'DataSettingsPage');
const AboutSettingsPage = lazyPage(() => import('@/features/settings/pages/AboutSettingsPage'), 'AboutSettingsPage');
const ProfilePage = lazyPage(() => import('@/features/profile/ProfilePage'), 'ProfilePage');
const ImportPage = lazyPage(() => import('@/features/import/ImportPage'), 'ImportPage');
const GoalsPage = lazyPage(() => import('@/features/goals/GoalsPage'), 'GoalsPage');
const WorkoutDetailPage = lazyPage(() => import('@/features/history/WorkoutDetailPage'), 'WorkoutDetailPage');
const BrandingPage = lazyPage(() => import('@/features/branding/BrandingPage'), 'BrandingPage');
const AdminPage = lazyPage(() => import('@/features/admin/AdminPage'), 'AdminPage');
const AchievementsPage = lazyPage(() => import('@/features/achievements/AchievementsPage'), 'AchievementsPage');

/*
 * Το app σερβίρεται και από υποφάκελο (GitHub Pages: /anabasis/). Χωρίς
 * basename ο router θα έψαχνε το «/skills» στη ρίζα του domain και κάθε deep
 * link θα έσπαγε. Το `import.meta.env.BASE_URL` το γεμίζει το Vite από το
 * `base`, οπότε η μία ρύθμιση καλύπτει build + routing.
 */
const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

export const router = createBrowserRouter(
  [
  {
    path: '/',
    element: <AppShell />,
    children: [
      // Το «μια ματιά» είναι η αρχική: ο χρήστης θέλει πρώτα να δει πού
      // βρίσκεται, και μετά να πατήσει έναρξη προπόνησης.
      { index: true, element: <DashboardPage /> },
      // Η έναρξη/καταγραφή προπόνησης γίνεται πλέον από το Calendar (v4).
      // Το /workout μένει ως legacy redirect (PWA shortcuts, παλιά links).
      { path: 'workout', element: <Navigate to="/calendar" replace /> },
      { path: 'workout/active', element: <ActiveWorkoutRoute /> },
      { path: 'admin', element: <AdminPage /> },
      { path: 'achievements', element: <AchievementsPage /> },
      { path: 'programs', element: <ProgramsPage /> },
      { path: 'exercises', element: <ExercisesPage /> },
      { path: 'exercises/:exerciseId', element: <ExerciseDetailPage /> },
      { path: 'activities', element: <ActivitiesPage /> },
      { path: 'programs/:programId', element: <ProgramDetailPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'history/:workoutId', element: <WorkoutDetailPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'body', element: <BodyPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'skills/:skillId', element: <SkillDetailPage /> },
      // Οι Ρυθμίσεις είναι hub + υποσελίδες: η μία μακριά στήλη είχε γίνει
      // αδιάβαστη. Το /profile μένει ως redirect — παλιά links & PWA shortcuts.
      { path: 'settings', element: <SettingsPage /> },
      { path: 'settings/account', element: <AccountSettingsPage /> },
      { path: 'settings/profiles', element: <ProfilePage /> },
      { path: 'settings/appearance', element: <AppearanceSettingsPage /> },
      { path: 'settings/training', element: <TrainingSettingsPage /> },
      { path: 'settings/data', element: <DataSettingsPage /> },
      { path: 'settings/about', element: <AboutSettingsPage /> },
      { path: 'profile', element: <Navigate to="/settings/profiles" replace /> },
      { path: 'goals', element: <GoalsPage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'branding', element: <BrandingPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  ],
  { basename: basename || undefined },
);
