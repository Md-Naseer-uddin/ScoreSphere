import { Navigate, type RouteObject } from 'react-router';
import { ComingSoon } from '@/features/common/ComingSoon';
import { NotFoundPage } from '@/features/common/NotFoundPage';
import { HomePage } from '@/features/home/HomePage';
import { SportsPage } from '@/features/sports/SportsPage';
import { AppShell } from './AppShell';
import { RouteError } from './RouteError';

/** Route table, kept separate from the router instance so tests can mount it in memory. */
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    path: '/app',
    element: <AppShell />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'sports', element: <SportsPage /> },
      { path: 'matches', element: <ComingSoon /> },
      { path: 'teams', element: <ComingSoon /> },
      { path: 'profile', element: <ComingSoon /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
