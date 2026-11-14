import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import { type HockeyCommand, hockeyEngine, type HockeyState } from '../engine.js';
import type { HockeySettings } from '../settings.js';
import type { HockeyGoldenLog } from './logs.js';

type Projection = MatchProjection<HockeyState, HockeySettings, HockeyCommand>;

export function hockeyParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 401).padStart(12, '0')}`;
}

export interface HockeyGoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  handles: Record<string, string>;
}

/** Expands a hockey golden script into ledger events, appending each as a scorer would. */
export function runHockeyGoldenLog(log: HockeyGoldenLog): HockeyGoldenRun {
  const all = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(all.map((h, i) => [h, hockeyParticipantId(i)]));
  const handles = Object.fromEntries(Object.entries(ids).map(([h, id]) => [id, h]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  const id = (h: string) => {
    const value = ids[h];
    if (!value) throw new Error(`${log.name}: unknown player "${h}"`);
    return value;
  };
  let periodStart = 1_700_000_000_000;
  let occurredAt = periodStart;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'field-hockey',
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
  const first = replay(hockeyEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(hockeyEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: HockeyCommand, label: string) =>
    push({ kind: 'COMMAND', payload }, label);

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 'START');
  for (const raw of log.script) {
    let line = raw.trim();
    const at = /^@(\d+):(\d\d)\s+/.exec(line);
    if (at) {
      occurredAt = periodStart + (Number(at[1]) * 60 + Number(at[2])) * 1000;
      line = line.slice(at[0].length);
    } else {
      occurredAt += 1000;
    }
    const [word, ...args] = line.split(/\s+/);
    const player = (h: string | undefined) => (h && h !== '-' ? id(h) : undefined);
    switch (word) {
      case 'start':
        // Periods start an hour apart, so intervals never overlap play.
        periodStart = Math.max(occurredAt, periodStart + 3_600_000);
        occurredAt = periodStart;
        command({ type: 'start_period' }, line);
        break;
      case 'end':
        command({ type: 'end_period' }, line);
        break;
      case 'stop':
        command({ type: 'stop_clock' }, line);
        break;
      case 'restart':
        command({ type: 'restart_clock' }, line);
        break;
      case 'goal':
      case 'pcgoal': {
        const [s, scorer, assistWord, assist] = args;
        command(
          {
            type: 'goal',
            side: side(s!),
            kind: word === 'pcgoal' ? 'penalty_corner' : 'field_goal',
            ...(scorer ? { scorerId: id(scorer) } : {}),
            ...(assistWord === 'assist' ? { assistId: id(assist!) } : {}),
          },
          line,
        );
        break;
      }
      case 'pc':
        command({ type: 'penalty_corner', side: side(args[0]!) }, line);
        break;
      case 'stroke': {
        const taker = player(args[1]);
        command(
          {
            type: 'penalty_stroke',
            side: side(args[0]!),
            scored: args[2] === 'in',
            ...(taker ? { takerId: taker } : {}),
          },
          line,
        );
        break;
      }
      case 'green':
      case 'yellow':
      case 'red':
        command(
          {
            type: 'card',
            side: side(args[0]!),
            playerId: id(args[1]!),
            color: word,
            ...(args[2] ? { minutes: Number(args[2]) } : {}),
          },
          line,
        );
        break;
      case 'shootout':
        command({ type: 'start_shootout', firstSide: side(args[0]!) }, line);
        break;
      case 'attempt': {
        const p = player(args[1]);
        command(
          {
            type: 'shootout_attempt',
            side: side(args[0]!),
            scored: args[2] === 'in',
            ...(p ? { playerId: p } : {}),
          },
          line,
        );
        break;
      }
      case 'whistle':
        command({ type: 'final_whistle' }, line);
        break;
      case 'concede':
        command({ type: 'concede', side: side(args[0]!), reason: args[1] as 'forfeit' }, line);
        break;
      default:
        throw new Error(`${log.name}: unknown line "${line}"`);
    }
  }
  return { events, projection, ids, handles };
}
