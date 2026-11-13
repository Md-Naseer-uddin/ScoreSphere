import {
  type CreatedShareLink,
  createdShareLinkSchema,
  type LeaseResponse,
  leaseResponseSchema,
  type LiveSnapshot,
  liveSnapshotSchema,
  type MatchDetail,
  matchDetailSchema,
  type MatchSummary,
  matchSummarySchema,
  SHARE_TOKEN_HEADER,
  type ShareLink,
  shareLinkSchema,
} from '@scoresphere/contracts';
import { z } from 'zod';
import { apiFetch, json } from '@/lib/api';
import { getDeviceId } from '@/lib/db';

export const matchKeys = {
  list: (workspaceId: string) => ['matches', workspaceId] as const,
  detail: (matchId: string) => ['match', matchId] as const,
  shareLinks: (matchId: string) => ['match', matchId, 'share-links'] as const,
};

export function listMatches(workspaceId: string): Promise<MatchSummary[]> {
  return apiFetch(`/workspaces/${workspaceId}/matches`, {}, z.array(matchSummarySchema));
}

export function getMatch(matchId: string): Promise<MatchDetail> {
  return apiFetch(`/matches/${matchId}`, {}, matchDetailSchema);
}

export async function lease(
  matchId: string,
  action: 'CLAIM' | 'TAKEOVER' | 'RELEASE' | 'HEARTBEAT',
): Promise<LeaseResponse> {
  return apiFetch(
    `/matches/${matchId}/lease`,
    { method: 'POST', ...json({ deviceId: await getDeviceId(), action }) },
    leaseResponseSchema,
  );
}

export function createShareLink(
  matchId: string,
  expiresInHours: number | null,
): Promise<CreatedShareLink> {
  return apiFetch(
    `/matches/${matchId}/share-links`,
    { method: 'POST', ...json({ expiresInHours }) },
    createdShareLinkSchema,
  );
}

export function listShareLinks(matchId: string): Promise<ShareLink[]> {
  return apiFetch(`/matches/${matchId}/share-links`, {}, z.array(shareLinkSchema));
}

export function revokeShareLink(matchId: string, linkId: string): Promise<void> {
  return apiFetch(`/matches/${matchId}/share-links/${linkId}`, { method: 'DELETE' });
}

/** The spectator snapshot behind a share link; the token goes in a header (ADR 0021). */
export function getLiveSnapshot(token: string): Promise<LiveSnapshot> {
  return apiFetch(
    '/public/live',
    { auth: false, headers: { [SHARE_TOKEN_HEADER]: token } },
    liveSnapshotSchema,
  );
}
