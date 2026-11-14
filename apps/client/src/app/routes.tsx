import { Navigate, type RouteObject } from 'react-router';
import { AuthLayout } from '@/features/auth/AuthLayout';
import { ForgotPasswordPage } from '@/features/auth/ForgotPasswordPage';
import { LoginPage } from '@/features/auth/LoginPage';
import { RecoveryCodePage } from '@/features/auth/RecoveryCodePage';
import { RegisterPage } from '@/features/auth/RegisterPage';
import { RequireAuth } from '@/features/auth/RequireAuth';
import { NotFoundPage } from '@/features/common/NotFoundPage';
import { HomePage } from '@/features/home/HomePage';
import { DownloadPage } from '@/features/download/DownloadPage';
import { PrivacyPage, TermsPage } from '@/features/legal/LegalPage';
import { LivePage } from '@/features/live/LivePage';
import { MatchesPage } from '@/features/matches/MatchesPage';
import { MatchPage } from '@/features/matches/MatchPage';
import { NewMatchPage } from '@/features/matches/NewMatchPage';
import { ScoreMatchPage } from '@/features/matches/ScoreMatchPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { SportsPage } from '@/features/sports/SportsPage';
import { RosterPage } from '@/features/teams/RosterPage';
import { TeamDetailPage } from '@/features/teams/TeamDetailPage';
import { TeamsPage } from '@/features/teams/TeamsPage';
import { CreateOrganizationPage } from '@/features/workspaces/CreateOrganizationPage';
import { JoinPage } from '@/features/workspaces/JoinPage';
import { TournamentPage } from '@/features/tournaments/TournamentPage';
import { NewTournamentPage, TournamentsPage } from '@/features/tournaments/TournamentsPage';
import { WorkspaceSettingsPage } from '@/features/workspaces/WorkspaceSettingsPage';
import { AppShell } from './AppShell';
import { RouteError } from './RouteError';
import { SignedInRoot } from './SignedInRoot';

/** Route table, kept separate from the router instance so tests can mount it in memory. */
export const routes: RouteObject[] = [
  { path: '/', element: <Navigate to="/app" replace /> },
  {
    path: '/auth',
    element: <AuthLayout />,
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/auth/login" replace /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'register', element: <RegisterPage /> },
      { path: 'forgot-password', element: <ForgotPasswordPage /> },
      { path: 'recovery-code', element: <RecoveryCodePage /> },
    ],
  },
  { path: '/join', element: <JoinPage />, errorElement: <RouteError /> },
  { path: '/live', element: <LivePage />, errorElement: <RouteError /> },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
  { path: '/download', element: <DownloadPage /> },
  {
    path: '/app',
    element: (
      <RequireAuth>
        <SignedInRoot />
      </RequireAuth>
    ),
    errorElement: <RouteError />,
    children: [
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'sports', element: <SportsPage /> },
          { path: 'matches', element: <MatchesPage /> },
          { path: 'matches/new', element: <NewMatchPage /> },
          { path: 'matches/:matchId', element: <MatchPage /> },
          { path: 'tournaments', element: <TournamentsPage /> },
          { path: 'tournaments/new', element: <NewTournamentPage /> },
          { path: 'tournaments/:tournamentId', element: <TournamentPage /> },
          { path: 'teams', element: <TeamsPage /> },
          { path: 'teams/roster', element: <RosterPage /> },
          { path: 'teams/:teamId', element: <TeamDetailPage /> },
          { path: 'profile', element: <ProfilePage /> },
          { path: 'workspaces/new', element: <CreateOrganizationPage /> },
          { path: 'workspaces/:workspaceId', element: <WorkspaceSettingsPage /> },
        ],
      },
      // Scoring uses a focused layout without the tab bar (spec frontend §3).
      { path: 'matches/:matchId/score', element: <ScoreMatchPage /> },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
];
