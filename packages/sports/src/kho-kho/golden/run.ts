import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import { type KhoKhoCommand, khoKhoEngine, type KhoKhoState, type OutKind } from '../engine.js';
import type { KhoKhoSettings } from '../settings.js';
import type { KhoKhoGoldenLog } from './logs.js';

type Projection = MatchProjection<KhoKhoState, KhoKhoSettings, KhoKhoCommand>;

export function khoKhoParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 701).padStart(12, '0')}`;
}

export interface KhoKhoGoldenRun {
  events: LedgerEvent[];
  projection: Projection;
  ids: Record<string, string>;
  handles: Record<string, string>;
}

/** Expands a kho-kho golden script into ledger events, appending each as a scorer would. */
export function runKhoKhoGoldenLog(log: KhoKhoGoldenLog): KhoKhoGoldenRun {
  const all = [...log.players.A, ...log.players.B];
  const ids = Object.fromEntries(all.map((h, i) => [h, khoKhoParticipantId(i)]));
  const handles = Object.fromEntries(Object.entries(ids).map(([h, id]) => [id, h]));
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  const player = (h: string | undefined) => {
    if (!h || h === '-') return undefined;
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
        sport: 'kho-kho',
        presetKey: 'golden',
        presetVersion: 1,
        config: log.config,
        roster: {
          sides: [
            { side: 0, participantIds: log.players.A.map((h) => ids[h]) },
            { side: 1, participantIds: log.players.B.map((h) => ids[h]) },
          ],
        },
        ...(log.rules ? { rules: log.rules } : {}),
      },
    },
  ];
  const first = replay(khoKhoEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    occurredAt += 15_000;
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(khoKhoEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: KhoKhoCommand, label: string) =>
    push({ kind: 'COMMAND', payload }, label);

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 'START');
  for (const raw of log.script) {
    const line = raw.trim();
    const [word, ...args] = line.split(/\s+/);
    switch (word) {
      case 'start':
        command({ type: 'start_turn', ...(args[0] ? { chasing: side(args[0]) } : {}) }, line);
        break;
      case 'end':
        command({ type: 'end_turn' }, line);
        break;
      case 'stop':
        command({ type: 'stop_clock' }, line);
        break;
      case 'go':
        command({ type: 'start_clock' }, line);
        break;
      case 'out': {
        const chaserId = player(args[1]);
        const defenderId = player(args[2]);
        command(
          {
            type: 'out',
            kind: args[0] as OutKind,
            ...(chaserId ? { chaserId } : {}),
            ...(defenderId ? { defenderId } : {}),
          },
          line,
        );
        break;
      }
      case 'tech':
        command({ type: 'technical', side: side(args[0]!), points: Number(args[1]) }, line);
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
