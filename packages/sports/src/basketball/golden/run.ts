import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import {
  type BasketballCommand,
  basketballEngine,
  type BasketballState,
  FOUL_KINDS,
  type FoulKind,
} from '../engine.js';
import type { BasketballSettings } from '../settings.js';
import type { BasketballGoldenLog } from './logs.js';

type Projection = MatchProjection<BasketballState, BasketballSettings, BasketballCommand>;

export function basketballParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 501).padStart(12, '0')}`;
}

export interface BasketballGoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  handles: Record<string, string>;
}

const PLAYS = { reb: 'rebound', stl: 'steal', blk: 'block', tov: 'turnover' } as const;

/** Expands a basketball golden script into ledger events, appending each as a scorer would. */
export function runBasketballGoldenLog(log: BasketballGoldenLog): BasketballGoldenRun {
  const all = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(all.map((h, i) => [h, basketballParticipantId(i)]));
  const handles = Object.fromEntries(Object.entries(ids).map(([h, id]) => [id, h]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  const id = (h: string) => {
    const value = ids[h];
    if (!value) throw new Error(`${log.name}: unknown player "${h}"`);
    return value;
  };
  const player = (h: string | undefined) => (h && h !== '-' ? { playerId: id(h) } : {});
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'basketball',
        presetKey: 'golden',
        presetVersion: 1,
        config: log.config,
        roster: {
          sides: [
            { side: 0, participantIds: log.players.A.map(id) },
            { side: 1, participantIds: log.players.B.map(id) },
          ],
        },
        ...(log.rules ? { rules: log.rules } : {}),
      },
    },
  ];
  const first = replay(basketballEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const command = (payload: BasketballCommand, label: string) => {
    occurredAt += 10_000;
    const event = { kind: 'COMMAND', payload, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(basketballEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const start = {
    kind: 'LIFECYCLE',
    payload: { action: 'START' },
    seq: 2,
    occurredAt,
  } as LedgerEvent;
  const started = append(basketballEngine, projection, events, start);
  if (!started.ok) throw new Error(started.error.message);
  projection = started.value;
  events.push(start);

  for (const raw of log.script) {
    const line = raw.trim();
    const [word, ...args] = line.split(/\s+/);
    switch (word) {
      case 'start':
        command({ type: 'start_period' }, line);
        break;
      case 'end':
        command({ type: 'end_period' }, line);
        break;
      case 'stop':
        command({ type: 'stop_clock' }, line);
        break;
      case 'go':
        command({ type: 'start_clock' }, line);
        break;
      case '1':
      case '2':
      case '3': {
        const [s, scorer, assistWord, assist] = args;
        command(
          {
            type: 'score',
            side: side(s!),
            points: Number(word) as 1 | 2 | 3,
            ...player(scorer),
            ...(assistWord === 'assist' ? { assistId: id(assist!) } : {}),
          },
          line,
        );
        break;
      }
      case 'miss1':
      case 'miss2':
      case 'miss3':
        command(
          {
            type: 'miss',
            side: side(args[0]!),
            points: Number(word.slice(4)) as 1 | 2 | 3,
            ...player(args[1]),
          },
          line,
        );
        break;
      case 'foul': {
        const kind = (args[2] ?? 'personal') as FoulKind;
        if (!FOUL_KINDS.includes(kind)) throw new Error(`${log.name}: bad foul "${line}"`);
        command({ type: 'foul', side: side(args[0]!), kind, ...player(args[1]) }, line);
        break;
      }
      case 'timeout':
        command({ type: 'timeout', side: side(args[0]!) }, line);
        break;
      case 'reb':
      case 'stl':
      case 'blk':
      case 'tov':
        command(
          { type: 'play', side: side(args[0]!), kind: PLAYS[word], playerId: id(args[1]!) },
          line,
        );
        break;
      case 'whistle':
        command({ type: 'final_whistle' }, line);
        break;
      default:
        throw new Error(`${log.name}: unknown line "${line}"`);
    }
  }
  return { events, projection, ids, handles };
}
