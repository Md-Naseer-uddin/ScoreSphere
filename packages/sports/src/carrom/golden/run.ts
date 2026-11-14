import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import { type CarromCommand, carromEngine, type CarromState } from '../engine.js';
import type { CarromSettings } from '../settings.js';
import type { CarromGoldenLog } from './logs.js';

type Projection = MatchProjection<CarromState, CarromSettings, CarromCommand>;

const id = (n: number) => `018f0000-0000-7000-8000-${String(900 + n).padStart(12, '0')}`;

/** Expands a carrom golden script into ledger events, appending each as a scorer would. */
export function runCarromGoldenLog(log: CarromGoldenLog): {
  events: LedgerEvent[];
  projection: Projection;
} {
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  const perSide = log.config.discipline === 'doubles' ? 2 : 1;
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'carrom',
        presetKey: 'golden',
        presetVersion: 1,
        config: log.config,
        roster: {
          sides: [0, 1].map((s) => ({
            side: s,
            participantIds: Array.from({ length: perSide }, (_, i) => id(s * 10 + i)),
          })),
        },
        ...(log.rules ? { rules: log.rules } : {}),
      },
    },
  ];
  const first = replay(carromEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, label: string) => {
    occurredAt += 60_000;
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(carromEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: CarromCommand, label: string) =>
    push({ kind: 'COMMAND', payload }, label);

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 'START');
  for (const raw of log.script) {
    const line = raw.trim();
    const [word, ...args] = line.split(/\s+/);
    switch (word) {
      case 'start':
        command({ type: 'start_match', firstBreak: side(args[0]!) }, line);
        break;
      case 'board':
        command(
          {
            type: 'board',
            winner: side(args[0]!),
            coinsLeft: Number(args[1]),
            queenCoveredBy: args[2] === 'queen' ? side(args[3]!) : null,
          },
          line,
        );
        break;
      case 'foul':
        command({ type: 'foul', side: side(args[0]!) }, line);
        break;
      case 'bonus':
        command({ type: 'bonus', side: side(args[0]!), points: Number(args[1]) }, line);
        break;
      case 'concede':
        command({ type: 'concede', side: side(args[0]!), reason: args[1] as 'retired' }, line);
        break;
      default:
        throw new Error(`${log.name}: unknown line "${line}"`);
    }
  }
  return { events, projection };
}
