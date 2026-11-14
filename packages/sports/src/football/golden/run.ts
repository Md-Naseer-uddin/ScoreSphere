import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import { type FootballCommand, footballEngine, type FootballState } from '../engine.js';
import type { FootballSettings } from '../settings.js';
import type { FootballGoldenLog } from './logs.js';

type Projection = MatchProjection<FootballState, FootballSettings, FootballCommand>;

export function footballParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 301).padStart(12, '0')}`;
}

export interface FootballGoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  handles: Record<string, string>;
}

/** Expands a football golden script into ledger events, appending each as a scorer would. */
export function runFootballGoldenLog(log: FootballGoldenLog): FootballGoldenRun {
  const all = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(all.map((h, i) => [h, footballParticipantId(i)]));
  const handles = Object.fromEntries(Object.entries(ids).map(([h, id]) => [id, h]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  const id = (h: string) => {
    const value = ids[h];
    if (!value) throw new Error(`${log.name}: unknown player "${h}"`);
    return value;
  };
  const base = 1_700_000_000_000;
  let periodStart = base;
  let occurredAt = base;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'football',
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
  const first = replay(footballEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(footballEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: FootballCommand, label: string) =>
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
    switch (word) {
      case 'kickoff': {
        const bar = args.indexOf('|');
        periodStart = occurredAt;
        command(
          {
            type: 'start_period',
            lineups: [args.slice(0, bar).map(id), args.slice(bar + 1).map(id)],
          },
          line,
        );
        break;
      }
      case 'start':
        // Periods start an hour apart, so breaks never overlap play.
        periodStart = Math.max(occurredAt, periodStart + 3_600_000);
        occurredAt = periodStart;
        command({ type: 'start_period' }, line);
        break;
      case 'end':
        command({ type: 'end_period' }, line);
        break;
      case 'goal':
      case 'pen':
      case 'og': {
        const [s, scorer, assistWord, assist] = args;
        command(
          {
            type: 'goal',
            side: side(s!),
            kind: word === 'pen' ? 'penalty' : word === 'og' ? 'own_goal' : 'regular',
            ...(scorer ? { scorerId: id(scorer) } : {}),
            ...(assistWord === 'assist' ? { assistId: id(assist!) } : {}),
          },
          line,
        );
        break;
      }
      case 'yellow':
      case 'red':
        command({ type: 'card', side: side(args[0]!), playerId: id(args[1]!), color: word }, line);
        break;
      case 'sub': {
        const [outH, inH] = args[1]!.split('>');
        command(
          { type: 'substitute', side: side(args[0]!), outId: id(outH!), inId: id(inH!) },
          line,
        );
        break;
      }
      case 'shootout':
        command({ type: 'start_shootout', firstSide: side(args[0]!) }, line);
        break;
      case 'kick':
        command(
          {
            type: 'shootout_kick',
            side: side(args[0]!),
            scored: args[2] === 'in',
            ...(args[1] !== '-' ? { kickerId: id(args[1]!) } : {}),
          },
          line,
        );
        break;
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
