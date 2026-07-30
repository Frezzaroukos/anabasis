import { createBrowserRouter, Navigate } from 'react-router-dom';
import { AppShell } from './layouts/AppShell';
import { WorkoutPage } from '@/features/workout/WorkoutPage';
import { HistoryPage } from '@/features/history/HistoryPage';
import { CalendarPage } from '@/features/calendar/CalendarPage';
import { SkillsPage } from '@/features/skills/SkillsPage';
import { SkillDetailPage } from '@/features/skills/SkillDetailPage';
import { SettingsPage } from '@/features/settings/SettingsPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/workout" replace /> },
      { path: 'workout', element: <WorkoutPage /> },
      { path: 'history', element: <HistoryPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'skills', element: <SkillsPage /> },
      { path: 'skills/:skillId', element: <SkillDetailPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/workout" replace /> },
    ],
  },
]);
