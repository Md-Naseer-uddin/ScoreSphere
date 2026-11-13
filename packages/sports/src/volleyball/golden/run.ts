import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import {
  volleyballServer,
  type VolleyballCommand,
  volleyballEngine,
  type VolleyballState,
} from '../engine.js';
import type { VolleyballSettings } from '../settings.js';
import type { VolleyballGoldenLog } from './logs.js';

type Projection = MatchProjection<VolleyballState, VolleyballSettings, VolleyballCommand>;

export function volleyballParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 301).padStart(12, '0')}`;
}

export interface VolleyballGoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  handles: Record<string, string>;
  /** Server before each rally, per set. */
  servers: string[][];
}

export function runVolleyballGoldenLog(log: VolleyballGoldenLog): VolleyballGoldenRun {
  const all = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(all.map((h, i) => [h, volleyballParticipantId(i)]));
  const handles = Object.fromEntries(Object.entries(ids).map(([h, id]) => [id, h]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  const id = (h: string) => {
    const v = ids[h];
    if (!v) throw new Error(`${log.name}: unknown player "${h}"`);
    return v;
  };
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'volleyball',
        presetKey: 'golden',
        presetVersion: 1,
        config: log.config,
        roster: {
          sides: [
            { side: 0, participantIds: log.players.A.map(id) },
            { side: 1, participantIds: log.players.B.map(id) },
          ],
        },
      },
    },
  ];
  const first = replay(volleyballEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const servers: string[][] = [];

  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    occurredAt += 25_000;
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(volleyballEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: VolleyballCommand, label: string) =>
    push({ kind: 'COMMAND', payload }, label);

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 'START');
  for (const line of log.script) {
    const [word, ...args] = line.trim().split(/\s+/);
    switch (word) {
      case 'set': {
        const [a, b] = args
          .slice(1)
          .join(' ')
          .split('|')
          .map((part) => part.trim().split(/\s+/).map(id));
        command({ type: 'start_set', servingSide: side(args[0]!), lineups: [a!, b!] }, line);
        servers.push([]);
        break;
      }
      case 'sub':
        command(
          { type: 'substitute', side: side(args[0]!), outId: id(args[1]!), inId: id(args[2]!) },
          line,
        );
        break;
      case 'timeout':
        command({ type: 'timeout', side: side(args[0]!) }, line);
        break;
      case 'concede':
        command({ type: 'concede', side: side(args[0]!), reason: args[1] as 'retired' }, line);
        break;
      default:
        for (const token of line.trim().split(/\s+/)) {
          const [body, times] = token.split('*');
          for (let i = 0; i < Number(times ?? 1); i++) {
            const [w, player, kind] = body!.split(':');
            servers[servers.length - 1]!.push(handles[volleyballServer(projection.state)!]!);
            command(
              {
                type: 'rally',
                winner: side(w!),
                ...(player ? { credit: { playerId: id(player), kind: kind as 'attack' } } : {}),
              },
              token,
            );
          }
        }
    }
  }
  return { events, projection, ids, handles, servers };
}
