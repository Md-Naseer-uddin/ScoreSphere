import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import { currentServer, type TennisCommand, tennisEngine, type TennisState } from '../engine.js';
import type { TennisSettings } from '../settings.js';
import type { TennisGoldenLog } from './logs.js';

type Projection = MatchProjection<TennisState, TennisSettings, TennisCommand>;

export function tennisParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 201).padStart(12, '0')}`;
}

export interface TennisGoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  /** Server of every point played, in order. */
  pointServers: string[];
  /** Server of the first point of every game, in order. */
  gameServers: string[];
}

/** Expands a tennis golden script into ledger events, appending each as a scorer would. */
export function runTennisGoldenLog(log: TennisGoldenLog): TennisGoldenRun {
  const handles = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(handles.map((h, i) => [h, tennisParticipantId(i)]));
  const byId = Object.fromEntries(Object.entries(ids).map(([h, id]) => [id, h]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'tennis',
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
  const first = replay(tennisEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const pointServers: string[] = [];
  const gameServers: string[] = [];

  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    occurredAt += 30_000;
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(tennisEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: TennisCommand, label: string) =>
    push({ kind: 'COMMAND', payload }, label);

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 'START');
  for (const line of log.script) {
    const [word, ...args] = line.trim().split(/\s+/);
    if (word === 'start') {
      command(
        {
          type: 'start_match',
          servingSide: side(args[0]!),
          ...(args[1] ? { firstServers: [ids[args[1]]!, ids[args[2]!]!] as [string, string] } : {}),
        },
        line,
      );
      continue;
    }
    if (word === 'concede') {
      command({ type: 'concede', side: side(args[0]!), reason: args[1] as 'retired' }, line);
      continue;
    }
    for (const token of line.trim().split(/\s+/)) {
      const [body, times] = token.split('*');
      for (let i = 0; i < Number(times ?? 1); i++) {
        const winners = body!.startsWith('g')
          ? [body![1]!, body![1]!, body![1]!, body![1]!]
          : [...body!];
        for (const w of winners) {
          const state = projection.state;
          const server = byId[currentServer(state)!]!;
          if (state.game.points[0] + state.game.points[1] === 0) gameServers.push(server);
          pointServers.push(server);
          command({ type: 'point', winner: side(w) }, token);
        }
      }
    }
  }
  return { events, projection, ids, pointServers, gameServers };
}
