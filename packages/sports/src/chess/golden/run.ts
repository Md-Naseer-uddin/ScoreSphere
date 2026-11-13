import { append, type LedgerEvent, type MatchProjection, replay } from '@scoresphere/engine-kit';
import { type ChessCommand, chessEngine, type ChessState } from '../engine.js';
import type { ChessSettings } from '../settings.js';
import type { ChessGoldenLog } from './logs.js';

type Projection = MatchProjection<ChessState, ChessSettings, ChessCommand>;

export function chessParticipantId(index: number): string {
  return `018f0000-0000-7000-8000-${String(index + 401).padStart(12, '0')}`;
}

export function runChessGoldenLog(log: ChessGoldenLog) {
  const side = (s: string): 0 | 1 => (s === 'A' ? 0 : 1);
  let occurredAt = 1_700_000_000_000;
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt,
      payload: {
        sport: 'chess',
        presetKey: 'golden',
        presetVersion: 1,
        config: log.config,
        roster: {
          sides: [
            { side: 0, participantIds: [chessParticipantId(0)] },
            { side: 1, participantIds: [chessParticipantId(1)] },
          ],
        },
      },
    },
  ];
  const first = replay(chessEngine, events);
  if (!first.ok) throw new Error(`${log.name}: ${first.error.message}`);
  let projection: Projection = first.value;
  const push = (e: Omit<LedgerEvent, 'seq' | 'occurredAt'>, afterSec: number, label: string) => {
    occurredAt += Math.round(afterSec * 1000);
    const event = { ...e, seq: events.length + 1, occurredAt } as LedgerEvent;
    const next = append(chessEngine, projection, events, event);
    if (!next.ok) throw new Error(`${log.name}, "${label}": ${next.error.message}`);
    projection = next.value;
    events.push(event);
  };
  const command = (payload: ChessCommand, afterSec: number, label: string) =>
    push({ kind: 'COMMAND', payload }, afterSec, label);

  push({ kind: 'LIFECYCLE', payload: { action: 'START' } }, 0, 'START');
  for (const line of log.script) {
    const [word, ...args] = line.trim().split(/\s+/);
    switch (word) {
      case 'start':
        command({ type: 'start_clock', whiteSide: side(args[0]!) }, 0, line);
        break;
      case 'press':
        command({ type: 'press', side: side(args[0]!) }, Number(args[1]), line);
        break;
      case 'pause':
      case 'resume':
        push({ kind: 'LIFECYCLE', payload: { action: word.toUpperCase() } }, Number(args[0]), line);
        break;
      case 'flag':
        command(
          { type: 'flag', side: side(args[0]!), result: args[1] as 'loss' },
          Number(args[2]),
          line,
        );
        break;
      case 'result': {
        const [ending, winner, after] = args;
        command(
          {
            type: 'result',
            ending: ending as 'resignation',
            ...(winner && winner !== '-' ? { winner: side(winner) } : {}),
          },
          Number(after),
          line,
        );
        break;
      }
      default:
        throw new Error(`${log.name}: unknown line "${line}"`);
    }
  }
  return { events, projection };
}
