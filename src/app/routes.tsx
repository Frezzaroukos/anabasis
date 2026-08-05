import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { WorkoutPage } from '@/features/workout/WorkoutPage';
import { ProgramsPage } from '@/features/programs/ProgramsPage';
import { ExercisesPage } from '@/features/exercises/ExercisesPage';
import { ActivitiesPage } from '@/features/activities/ActivitiesPage';
import { ProgramDetailPage } from '@/features/programs/ProgramDetailPage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { BodyPage } from '@/features/body/BodyPage';
import { ProgressPage } from '@/features/progress/ProgressPage';
import { SkillsPage } from '@/features/skills/SkillsPage';
import { SkillDetailPage } from '@/features/skills/SkillDetailPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ProfilePage } from '@/features/profile/ProfilePage';

export const router = createBrowserRouter([
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
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'body', element: <BodyPage /> },
      { path: 'progress', element: <ProgressPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'skills/:skillId', element: <SkillDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'profile', element: <ProfilePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]);
