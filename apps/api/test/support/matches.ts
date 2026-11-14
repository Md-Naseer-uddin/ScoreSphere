import type { INestApplication } from '@nestjs/common';
import {
  type MatchEvent,
  type MatchHeader,
  newId,
  type PostMatchEventsResponse,
} from '@scoresphere/contracts';
import request from 'supertest';
import { bearer, type TestUser } from './app';

export const singles21 = {
  discipline: 'singles',
  pointsToWin: 21,
  winBy: 2,
  cap: 30,
  gamesToWin: 2,
  intervalAt: 11,
  deciderChangeEndsAt: 11,
};

type NewEvent = { kind: MatchEvent['kind']; payload: unknown; targetSeq?: number };

/**
 * Plays the scoring device: builds a badminton singles match and its ledger events with
 * the seq and lease epoch a real device would use.
 */
export class DeviceMatch {
  readonly matchId = newId();
  deviceId = newId();
  readonly players = [newId(), newId()] as const;
  epoch = 1;
  seq = 0;
  readonly header: MatchHeader;
  readonly config: Record<string, unknown>;
  readonly presetKey: string;

  constructor(
    workspaceId: string,
    rosterMemberIds: [string | null, string | null] = [null, null],
    options: { config?: Record<string, unknown>; presetKey?: string; fixtureId?: string } = {},
  ) {
    this.config = options.config ?? singles21;
    this.presetKey = options.presetKey ?? 'bwf-3x21';
    this.header = {
      workspaceId,
      title: null,
      ...(options.fixtureId ? { fixtureId: options.fixtureId } : {}),
      sides: [0, 1].map((side) => ({
        side: side as 0 | 1,
        name: side === 0 ? 'Asha' : 'Ravi',
        teamId: null,
        participants: [
          {
            participantId: this.players[side]!,
            displayName: side === 0 ? 'Asha' : 'Ravi',
            rosterMemberId: rosterMemberIds[side]!,
          },
        ],
      })),
    };
  }

  event(e: NewEvent): MatchEvent {
    this.seq += 1;
    return {
      eventId: newId(),
      seq: this.seq,
      leaseEpoch: this.epoch,
      engineVersion: 1,
      occurredAt: Date.now(),
      ...e,
    } as MatchEvent;
  }

  created(): MatchEvent {
    return this.event({
      kind: 'CREATED',
      payload: {
        sport: 'badminton',
        presetKey: this.presetKey,
        presetVersion: 1,
        config: this.config,
        roster: {
          sides: [
            { side: 0, participantIds: [this.players[0]] },
            { side: 1, participantIds: [this.players[1]] },
          ],
        },
      },
    });
  }

  start(): MatchEvent {
    return this.event({ kind: 'LIFECYCLE', payload: { action: 'START' } });
  }

  startGame(servingSide: 0 | 1 = 0): MatchEvent {
    return this.event({ kind: 'COMMAND', payload: { type: 'start_game', servingSide } });
  }

  rally(winner: 0 | 1): MatchEvent {
    return this.event({ kind: 'COMMAND', payload: { type: 'rally', winner } });
  }

  undo(targetSeq: number): MatchEvent {
    return this.event({ kind: 'VOID', targetSeq, payload: {} });
  }

  /** Created, started and the first game opened: seq 1–3. */
  opening(): MatchEvent[] {
    return [this.created(), this.start(), this.startGame(0)];
  }
}

export async function postEvents(
  app: INestApplication,
  user: TestUser,
  match: DeviceMatch,
  events: MatchEvent[],
  opts: { withHeader?: boolean; expect?: number } = {},
): Promise<PostMatchEventsResponse> {
  const res = await request(app.getHttpServer())
    .post(`/api/v1/matches/${match.matchId}/events`)
    .set(bearer(user.accessToken))
    .send({
      deviceId: match.deviceId,
      ...(opts.withHeader ? { match: match.header } : {}),
      events,
    })
    .expect(opts.expect ?? 200);
  return res.body.data;
}
