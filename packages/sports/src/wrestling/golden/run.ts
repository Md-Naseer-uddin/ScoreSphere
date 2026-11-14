import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import {
  type ActionKind,
  type WrestlingCommand,
  wrestlingEngine,
  type WrestlingState,
} from '../engine.js';
import type { WrestlingSettings } from '../settings.js';
import type { WrestlingGoldenLog } from './logs.js';

type Projection = MatchProjection<WrestlingState, WrestlingSettings, WrestlingCommand>;

export const wrestlingParticipantIds = [
  '018f0000-0000-7000-8000-000000000801',
  '018f0000-0000-7000-8000-000000000802',
] as const;

/** Expands a wrestling golden script into ledger events, appending each as a scorer would. */
export function runWrestlingGoldenLog(log: WrestlingGoldenLog): {
  events: LedgerEvent[];
  projection: Projection;
} {
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'wrestling',
        presetKey: 'golden',
        presetVersion: 1,
        config: log.config,
        roster: {
          sides: [
            { side: 0, participantIds: [wrestlingParticipantIds[0]] },
            { side: 1, participantIds: [wrestlingParticipantIds[1]] },
          ],
        },
        ...(log.rules ? { rules: log.rules } : {}),
      },
    },
  ];
  const first = replay(wrestlingEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    occurredAt += 10_000;
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(wrestlingEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: WrestlingCommand, label: string) =>
    push({ kind: 'COMMAND', payload }, label);

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 'START');
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
      case '4':
      case '5':
        command(
          {
            type: 'points',
            side: side(args[0]!),
            value: Number(word) as 1 | 2 | 4 | 5,
            ...(args[1] ? { kind: args[1] as ActionKind } : {}),
          },
          line,
        );
        break;
      case 'caution':
        command({ type: 'caution', side: side(args[0]!), penalty: Number(args[1]) as 1 | 2 }, line);
        break;
      case 'fall':
        command({ type: 'fall', side: side(args[0]!) }, line);
        break;
      case 'whistle':
        command({ type: 'final_whistle' }, line);
        break;
      case 'concede':
        command({ type: 'concede', side: side(args[0]!), reason: args[1] as 'injury' }, line);
        break;
      default:
        throw new Error(`${log.name}: unknown line "${line}"`);
    }
  }
  return { events, projection };
}
