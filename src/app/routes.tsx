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
const WorkoutPage = lazyPage(() => import('@/features/workout/WorkoutPage'), 'WorkoutPage');
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
const ProfilePage = lazyPage(() => import('@/features/profile/ProfilePage'), 'ProfilePage');
const ImportPage = lazyPage(() => import('@/features/import/ImportPage'), 'ImportPage');
const GoalsPage = lazyPage(() => import('@/features/goals/GoalsPage'), 'GoalsPage');
const WorkoutDetailPage = lazyPage(() => import('@/features/history/WorkoutDetailPage'), 'WorkoutDetailPage');
const BrandingPage = lazyPage(() => import('@/features/branding/BrandingPage'), 'BrandingPage');

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
      { path: 'workout', element: <WorkoutPage /> },
      { path: 'programs', element: <ProgramsPage /> },
      { path: 'exercises', element: <ExercisesPage /> },
      { path: 'activities', element: <ActivitiesPage /> },
      { path: 'programs/:programId', element: <ProgramDetailPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'history/:workoutId', element: <WorkoutDetailPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'body', element: <BodyPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'skills/:skillId', element: <SkillDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: 'goals', element: <GoalsPage /> },
      { path: 'import', element: <ImportPage /> },
      { path: 'branding', element: <BrandingPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
  ],
  { basename: basename || undefined },
);
