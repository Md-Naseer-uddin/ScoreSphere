import {
  append,
  type LedgerEvent,
  type MatchProjection,
  replay,
  undoTarget,
} from '@scoresphere/engine-kit';
import {
  badmintonEngine,
  type BadmintonCommand,
  type BadmintonState,
  type ServiceView,
  serviceView,
} from '../engine.js';
import type { BadmintonSettings } from '../settings.js';
import type { BadmintonGoldenLog } from './logs.js';

type Projection = MatchProjection<BadmintonState, BadmintonSettings, BadmintonCommand>;

/** Stable UUIDv7-shaped participant IDs for player handles. */
export function participantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 1).padStart(12, '0')}`;
}

export interface GoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  /** Service before each rally, then after the last event. */
  service: (ServiceView | null)[];
}

/** Expands a golden script into ledger events, appending each one as a scorer would. */
export function runGoldenLog(log: BadmintonGoldenLog): GoldenRun {
  const handles = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(handles.map((h, i) => [h, participantId(i)]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'badminton',
        presetKey: 'golden',
        presetVersion: 1,
        config: log.config,
        roster: {
          sides: [
            { side: 0, participantIds: log.players.A.map((h) => ids[h]) },
            { side: 1, participantIds: log.players.B.map((h) => ids[h]) },
          ],
        },
      },
    },
  ];
  const first = replay(badmintonEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const service: (ServiceView | null)[] = [];

  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>) => {
    occurredAt += 15_000;
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(badmintonEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, event ${event.seq}: ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: BadmintonCommand) => push({ kind: 'COMMAND', payload });

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } });
  for (const line of log.script) {
    const [word, ...args] = line.trim().split(/\s+/);
    if (word === 'start') {
      command({
        type: 'start_game',
        servingSide: side(args[0]!),
        ...(args[1] ? { serverId: ids[args[1]]! } : {}),
        ...(args[2] ? { receiverId: ids[args[2]]! } : {}),
      });
    } else if (word === 'undo') {
      push({ kind: 'VOID', targetSeq: undoTarget(projection.timeline)!, payload: {} });
    } else if (word === 'pause' || word === 'resume') {
      push({ kind: 'LIFECYCLE', payload: { action: word.toUpperCase() } });
    } else if (word === 'concede') {
      command({ type: 'concede', side: side(args[0]!), reason: args[1] as 'retired' });
    } else {
      for (const winner of expandRallies(line)) {
        service.push(serviceView(projection.state));
        command({ type: 'rally', winner: side(winner) });
      }
    }
  }
  service.push(serviceView(projection.state));
  return { events, projection, ids, service };
}

/** `AB*3 A` → A B A B A B A */
export function expandRallies(line: string): string[] {
  return line
    .trim()
    .split(/\s+/)
    .flatMap((token) => {
      const [pattern, times] = token.split('*');
      if (!pattern || !/^[AB]+$/.test(pattern)) throw new Error(`Bad rally token "${token}"`);
      return Array.from({ length: times ? Number(times) : 1 }, () => [...pattern]).flat();
    });
}
