import { type PlayerStats, playerStatsSchema } from '@scoresphere/contracts';
import { apiFetch } from '@/lib/api';

export const statsKeys = {
  player: (workspaceId: string, id: string) => ['stats', 'player', workspaceId, id] as const,
  team: (workspaceId: string, id: string) => ['stats', 'team', workspaceId, id] as const,
  me: ['stats', 'me'] as const,
};

export const getPlayerStats = (workspaceId: string, id: string): Promise<PlayerStats> =>
  apiFetch(`/workspaces/${workspaceId}/roster-members/${id}/stats`, {}, playerStatsSchema);

export const getTeamStats = (workspaceId: string, id: string): Promise<PlayerStats> =>
  apiFetch(`/workspaces/${workspaceId}/teams/${id}/stats`, {}, playerStatsSchema);

export const getMyStats = (): Promise<PlayerStats> => apiFetch('/me/stats', {}, playerStatsSchema);
