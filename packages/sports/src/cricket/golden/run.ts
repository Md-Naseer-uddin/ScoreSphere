import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import {
  type CricketCommand,
  type CricketState,
  cricketEngine,
  currentInnings,
  type DeliveryKind,
  DISMISSALS,
} from '../engine.js';
import type { CricketSettings } from '../settings.js';
import type { CricketGoldenLog } from './logs.js';

type Projection = MatchProjection<CricketState, CricketSettings, CricketCommand>;

/** Stable UUIDv7-shaped participant IDs for player handles (side A then side B). */
export function cricketParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 101).padStart(12, '0')}`;
}

export interface CricketGoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  handles: Record<string, string>;
}

const DELIVERY = /^(wd|nbb|nblb|nb|b|lb)?(\d)?(!)?$/;

/** Parses one ball token, e.g. `4!`, `wd2`, `nb1`, `lb2`, `W:caught:b3`, `1+W:run_out:a2:striker`. */
export function parseBall(
  token: string,
  striker: string,
  ids: Record<string, string>,
): CricketCommand {
  const [ballPart, wicketPart] = token.startsWith('W') ? ['0', token] : token.split('+W');
  const m = DELIVERY.exec(ballPart!);
  if (!m) throw new Error(`Bad ball "${token}"`);
  const prefix = m[1] ?? '';
  const kinds: Record<string, DeliveryKind> = {
    '': 'bat',
    wd: 'wide',
    nb: 'no_ball_bat',
    nbb: 'no_ball_bye',
    nblb: 'no_ball_leg_bye',
    b: 'bye',
    lb: 'leg_bye',
  };
  const id = (h: string | undefined) => {
    if (!h) return undefined;
    const value = ids[h];
    if (!value) throw new Error(`Unknown player "${h}" in "${token}"`);
    return value;
  };
  const cmd: Extract<CricketCommand, { type: 'delivery' }> = {
    type: 'delivery',
    kind: kinds[prefix]!,
    runs: Number(m[2] ?? 0),
    boundary: m[3] === '!',
  };
  if (wicketPart !== undefined) {
    const [, kind = 'bowled', ...rest] = (
      wicketPart.startsWith('W') ? wicketPart : `W${wicketPart}`
    ).split(':');
    if (!(DISMISSALS as readonly string[]).includes(kind))
      throw new Error(`Bad dismissal "${kind}"`);
    if (kind === 'run_out' || kind === 'obstructing_field') {
      const [batter, end, fielder] = rest;
      cmd.wicket = {
        kind: kind as 'run_out',
        batterId: id(batter)!,
        ...(end ? { end: end as 'striker' | 'non_striker' } : {}),
        ...(fielder ? { fielderId: id(fielder)! } : {}),
      };
    } else {
      const [fielder] = rest;
      cmd.wicket = {
        kind: kind as 'bowled',
        batterId: striker,
        ...(fielder ? { fielderId: id(fielder)! } : {}),
      };
    }
  }
  return cmd;
}

/** Expands a cricket golden script into ledger events, appending each as a scorer would. */
export function runCricketGoldenLog(log: CricketGoldenLog): CricketGoldenRun {
  const handlesInOrder = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(handlesInOrder.map((h, i) => [h, cricketParticipantId(i)]));
  const handles = Object.fromEntries(Object.entries(ids).map(([h, id]) => [id, h]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'cricket',
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
  const first = replay(cricketEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;

  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    occurredAt += 20_000;
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(cricketEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: CricketCommand, label: string) =>
    push({ kind: 'COMMAND', payload }, label);
  const id = (h: string) => {
    const value = ids[h];
    if (!value) throw new Error(`${log.name}: unknown player "${h}"`);
    return value;
  };

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 'START');
  for (const line of log.script) {
    const words = line.trim().split(/\s+/);
    const [word, ...args] = words;
    switch (word) {
      case 'toss':
        command({ type: 'toss', winner: side(args[0]!), decision: args[1] as 'bat' }, line);
        break;
      case 'innings': {
        const withSide = args[0] === 'A' || args[0] === 'B';
        const [s, n] = withSide ? args.slice(1) : args;
        command(
          {
            type: 'start_innings',
            ...(withSide ? { battingSide: side(args[0]!) } : {}),
            strikerId: id(s!),
            nonStrikerId: id(n!),
          },
          line,
        );
        break;
      }
      case 'bowler':
        command({ type: 'set_bowler', bowlerId: id(args[0]!) }, line);
        break;
      case 'next':
        command({ type: 'next_batter', batterId: id(args[0]!) }, line);
        break;
      case 'retire':
        command({ type: 'retire', batterId: id(args[0]!), kind: args[1] as 'hurt' }, line);
        break;
      case 'swap':
        command({ type: 'swap_ends' }, line);
        break;
      case 'declare':
        command({ type: 'declare' }, line);
        break;
      default:
        for (const token of words) {
          const striker = currentInnings(projection.state)?.atStrikerEnd ?? '';
          command(parseBall(token, striker, ids), token);
        }
    }
  }
  return { events, projection, ids, handles };
}
