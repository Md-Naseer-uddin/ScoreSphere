import {
  type AddTournamentEntriesRequest,
  type CreateTournamentRequest,
  type Leaderboard,
  leaderboardSchema,
  type StandingsRowDto,
  standingsRowSchema,
  type Tournament,
  type TournamentAward,
  tournamentAwardSchema,
  type TournamentDetail,
  tournamentDetailSchema,
  tournamentSchema,
} from '@scoresphere/contracts';
import { z } from 'zod';
import { apiFetch, json } from '@/lib/api';

export const tournamentKeys = {
  list: (workspaceId: string) => ['tournaments', workspaceId] as const,
  detail: (id: string) => ['tournament', id] as const,
  standings: (id: string) => ['tournament', id, 'standings'] as const,
  leaderboards: (id: string) => ['tournament', id, 'leaderboards'] as const,
  awards: (id: string) => ['tournament', id, 'awards'] as const,
};

export const listTournaments = (workspaceId: string): Promise<Tournament[]> =>
  apiFetch(`/workspaces/${workspaceId}/tournaments`, {}, z.array(tournamentSchema));

export const createTournament = (
  workspaceId: string,
  body: CreateTournamentRequest,
): Promise<Tournament> =>
  apiFetch(
    `/workspaces/${workspaceId}/tournaments`,
    { method: 'POST', ...json(body) },
    tournamentSchema,
  );

export const getTournament = (id: string): Promise<TournamentDetail> =>
  apiFetch(`/tournaments/${id}`, {}, tournamentDetailSchema);

export const addEntries = (
  id: string,
  body: AddTournamentEntriesRequest,
): Promise<TournamentDetail> =>
  apiFetch(`/tournaments/${id}/entries`, { method: 'POST', ...json(body) }, tournamentDetailSchema);

export const removeEntry = (id: string, entryId: string): Promise<TournamentDetail> =>
  apiFetch(`/tournaments/${id}/entries/${entryId}`, { method: 'DELETE' }, tournamentDetailSchema);

export const generateFixtures = (id: string): Promise<TournamentDetail> =>
  apiFetch(`/tournaments/${id}/fixtures`, { method: 'POST' }, tournamentDetailSchema);

export const decideFixture = (
  id: string,
  fixtureId: string,
  winnerEntryId: string,
): Promise<TournamentDetail> =>
  apiFetch(
    `/tournaments/${id}/fixtures/${fixtureId}/decision`,
    { method: 'POST', ...json({ winnerEntryId }) },
    tournamentDetailSchema,
  );

export const getStandings = (id: string): Promise<StandingsRowDto[]> =>
  apiFetch(`/tournaments/${id}/standings`, {}, z.array(standingsRowSchema));

export const getLeaderboards = (id: string): Promise<Leaderboard[]> =>
  apiFetch(`/tournaments/${id}/leaderboards`, {}, z.array(leaderboardSchema));

export const getTournamentAwards = (id: string): Promise<TournamentAward[]> =>
  apiFetch(`/tournaments/${id}/awards`, {}, z.array(tournamentAwardSchema));

export const republishAwards = (id: string): Promise<TournamentAward[]> =>
  apiFetch(`/tournaments/${id}/awards/publish`, { method: 'POST' }, z.array(tournamentAwardSchema));
