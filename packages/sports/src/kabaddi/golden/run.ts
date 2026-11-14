import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import {
  type KabaddiCommand,
  kabaddiEngine,
  type KabaddiState,
  type RaidResult,
} from '../engine.js';
import type { KabaddiSettings } from '../settings.js';
import type { KabaddiGoldenLog } from './logs.js';

type Projection = MatchProjection<KabaddiState, KabaddiSettings, KabaddiCommand>;

export function kabaddiParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 601).padStart(12, '0')}`;
}

export interface KabaddiGoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  handles: Record<string, string>;
}

/** Expands a kabaddi golden script into ledger events, appending each as a scorer would. */
export function runKabaddiGoldenLog(log: KabaddiGoldenLog): KabaddiGoldenRun {
  const all = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(all.map((h, i) => [h, kabaddiParticipantId(i)]));
  const handles = Object.fromEntries(Object.entries(ids).map(([h, id]) => [id, h]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  const id = (h: string) => {
    const value = ids[h];
    if (!value) throw new Error(`${log.name}: unknown player "${h}"`);
    return value;
  };
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'kabaddi',
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
  const first = replay(kabaddiEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    occurredAt += 20_000;
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(kabaddiEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: KabaddiCommand, label: string) =>
    push({ kind: 'COMMAND', payload }, label);

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 'START');
  for (const raw of log.script) {
    const line = raw.trim();
    const [word, ...args] = line.split(/\s+/);
    switch (word) {
      case 'start':
        command({ type: 'start_period', ...(args[0] ? { firstRaid: side(args[0]) } : {}) }, line);
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
      case 'raid': {
        const [s, raider, result, ...rest] = args;
        let touches = 0;
        let bonus = false;
        let tacklerId: string | undefined;
        const touchedIds: string[] = [];
        for (let i = 0; i < rest.length; i++) {
          const w = rest[i]!;
          if (/^\d+$/.test(w)) touches = Number(w);
          else if (w === 'bonus') bonus = true;
          else if (w === 'by') tacklerId = id(rest[++i]!);
          else touchedIds.push(id(w));
        }
        command(
          {
            type: 'raid',
            side: side(s!),
            ...(raider !== '-' ? { raiderId: id(raider!) } : {}),
            touches,
            ...(touchedIds.length ? { touchedIds } : {}),
            bonus,
            result: result as RaidResult,
            ...(tacklerId ? { tacklerId } : {}),
          },
          line,
        );
        break;
      }
      case 'out':
        command(
          {
            type: 'player_out',
            side: side(args[0]!),
            ...(args[1] ? { playerId: id(args[1]) } : {}),
          },
          line,
        );
        break;
      case 'tech':
        command({ type: 'technical', side: side(args[0]!), points: Number(args[1]) }, line);
        break;
      case 'timeout':
        command({ type: 'timeout', side: side(args[0]!) }, line);
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
