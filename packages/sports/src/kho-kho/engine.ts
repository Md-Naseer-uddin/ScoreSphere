import { idSchema, type MatchResult, type MatchRoster } from '@scoresphere/contracts';
import {
  type ApplyContext,
  beginPeriod,
  type CommandDescriptor,
  type DomainFact,
  endPeriod,
  type EngineError,
  err,
  holdPeriodClock,
  type MetricRecord,
  newPeriodClock,
  ok,
  type PeriodClock,
  periodClockRunning,
  periodElapsed,
  type Result,
  runPeriodClock,
  type SportEngine,
} from '@scoresphere/engine-kit';
import { z } from 'zod';
import { khoKhoRuleCatalogue, khoKhoRuleVariables } from './rules.js';
import { khoKhoPresets, type KhoKhoSettings, khoKhoSettingsSchema } from './settings.js';

/**
 * Kho-kho, version 1. In each innings both teams take one timed turn chasing while the
 * other defends. Defenders enter in batches; every defender put out scores for the
 * chasing team, and when all are out the batches start again until time runs out.
 */

type Side = 0 | 1;
const sideSchema = z.union([z.literal(0), z.literal(1)]);

export const OUT_KINDS = ['touch', 'pole_dive', 'out_of_field', 'late_entry', 'other'] as const;
export type OutKind = (typeof OUT_KINDS)[number];

export const khoKhoCommandSchema = z.discriminatedUnion('type', [
  /** Starts the next turn; the first needs the team that chases first (from the toss). */
  z.object({ type: z.literal('start_turn'), chasing: sideSchema.optional() }),
  z.object({ type: z.literal('end_turn') }),
  z.object({ type: z.literal('start_clock') }),
  z.object({ type: z.literal('stop_clock') }),
  /** A defender is out; the chaser who did it and the defender are optional. */
  z.object({
    type: z.literal('out'),
    kind: z.enum(OUT_KINDS),
    chaserId: idSchema.optional(),
    defenderId: idSchema.optional(),
  }),
  /** Points given by the referees, e.g. for a foul. */
  z.object({ type: z.literal('technical'), side: sideSchema, points: z.int().min(1).max(3) }),
  /** Ends the match now on the current score, e.g. from a mercy rule. */
  z.object({ type: z.literal('final_whistle') }),
  z.object({
    type: z.literal('concede'),
    side: sideSchema,
    reason: z.enum(['forfeit', 'walkover']),
  }),
]);
export type KhoKhoCommand = z.infer<typeof khoKhoCommandSchema>;

export interface OutRecord {
  chasing: Side;
  kind: OutKind;
  chaserId: string | null;
  defenderId: string | null;
  turn: number;
  /** Time into the turn. */
  atMs: number;
}

export interface KhoKhoState {
  config: KhoKhoSettings;
  players: [string[], string[]];
  phase: 'pre_match' | 'playing' | 'break' | 'complete';
  periods: PeriodClock;
  firstChaser: Side | null;
  /** The team chasing in the current (or last) turn. */
  chasing: Side | null;
  score: [number, number];
  outs: OutRecord[];
  /** Points by turn, for the scoresheet. */
  turnPoints: [number, number][];
  technicals: { side: Side; points: number }[];
  outcome: { winner: Side | null; finish: 'played' | 'forfeit' | 'walkover' } | null;
}

const other = (s: Side): Side => (s === 0 ? 1 : 0);
const fail = (code: string, message: string): Result<void, EngineError> => err({ code, message });

export const totalTurns = (c: KhoKhoSettings) => c.innings * 2;

/** The chasing team in turn `n`: teams alternate, starting with the toss winner's choice. */
export function chaserInTurn(first: Side, n: number): Side {
  return n % 2 === 1 ? first : other(first);
}

export function khoKhoClockLeft(state: KhoKhoState, now: number): number {
  return Math.max(0, state.config.turnMinutes * 60_000 - periodElapsed(state.periods, now));
}

/** Defenders out so far in the current turn, and where the current batch stands. */
export function batchView(state: KhoKhoState): { outs: number; batch: number; outInBatch: number } {
  const outs = state.outs.filter((o) => o.turn === state.periods.number).length;
  const size = state.config.batchSize;
  return { outs, batch: Math.floor(outs / size) + 1, outInBatch: outs % size };
}

function init(config: KhoKhoSettings, roster: MatchRoster): KhoKhoState {
  return {
    config,
    players: [roster.sides[0]!.participantIds, roster.sides[1]!.participantIds],
    phase: 'pre_match',
    periods: newPeriodClock(),
    firstChaser: null,
    chasing: null,
    score: [0, 0],
    outs: [],
    turnPoints: [],
    technicals: [],
    outcome: null,
  };
}

function validateSetup(_config: KhoKhoSettings, roster: MatchRoster): Result<void, EngineError> {
  for (const side of roster.sides) {
    if (side.participantIds.length < 1 || side.participantIds.length > 15) {
      return fail('SIDE_SIZE', 'Each team needs 1 to 15 players.');
    }
  }
  const all = roster.sides.flatMap((s) => s.participantIds);
  if (new Set(all).size !== all.length)
    return fail('DUPLICATE_PLAYER', 'A player can only appear once.');
  return ok(undefined);
}

function validate(state: KhoKhoState, cmd: KhoKhoCommand): Result<void, EngineError> {
  const playing = state.phase === 'playing';
  switch (cmd.type) {
    case 'start_turn':
      if (state.phase === 'pre_match') {
        return cmd.chasing === undefined
          ? fail('PICK_CHASER', 'Choose the team that chases first.')
          : ok(undefined);
      }
      if (state.phase !== 'break') return fail('NOT_NOW', 'A turn is already being played.');
      return cmd.chasing === undefined
        ? ok(undefined)
        : fail('CHASER_SET', 'Teams take turns to chase.');
    case 'end_turn':
      return playing ? ok(undefined) : fail('NOT_NOW', 'No turn is being played.');
    case 'start_clock':
      return playing && !periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is already running.');
    case 'stop_clock':
      return playing && periodClockRunning(state.periods)
        ? ok(undefined)
        : fail('NOT_NOW', 'The clock is not running.');
    case 'out': {
      if (!playing) return fail('NOT_NOW', 'Defenders are put out during a turn.');
      const chasing = state.chasing!;
      if (cmd.chaserId !== undefined && !state.players[chasing].includes(cmd.chaserId)) {
        return fail('NOT_IN_TEAM', 'The chaser must play for the chasing team.');
      }
      if (cmd.defenderId !== undefined && !state.players[other(chasing)].includes(cmd.defenderId)) {
        return fail('NOT_IN_TEAM', 'The defender must play for the defending team.');
      }
      if (cmd.chaserId !== undefined && cmd.kind !== 'touch' && cmd.kind !== 'pole_dive') {
        return fail('NO_CHASER', 'Only a touch or a pole dive is credited to a chaser.');
      }
      return ok(undefined);
    }
    case 'technical':
      return playing || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'The match is not being played.');
    case 'final_whistle':
      return playing || state.phase === 'break'
        ? ok(undefined)
        : fail('NOT_NOW', 'The match is not being played.');
    case 'concede':
      return state.phase === 'complete' ? fail('MATCH_OVER', 'The match is over.') : ok(undefined);
  }
}

function addPoints(state: KhoKhoState, side: Side, points: number): KhoKhoState {
  const score: [number, number] = [...state.score];
  score[side] += points;
  const turnPoints = state.turnPoints.map((p, i) =>
    i === state.turnPoints.length - 1
      ? ((side === 0 ? [p[0] + points, p[1]] : [p[0], p[1] + points]) as [number, number])
      : p,
  );
  return { ...state, score, turnPoints };
}

function finish(state: KhoKhoState, facts: DomainFact[]): KhoKhoState {
  const [a, b] = state.score;
  if (a === b) {
    facts.push({ type: 'match_drawn' });
    return { ...state, phase: 'complete', outcome: { winner: null, finish: 'played' } };
  }
  const winner: Side = a > b ? 0 : 1;
  facts.push({ type: 'match_won', data: { side: winner } });
  return { ...state, phase: 'complete', outcome: { winner, finish: 'played' } };
}

function apply(
  state: KhoKhoState,
  cmd: KhoKhoCommand,
  ctx: ApplyContext,
): { state: KhoKhoState; facts: DomainFact[] } {
  const at = ctx.occurredAt;
  const turn = state.periods.number;
  switch (cmd.type) {
    case 'start_turn': {
      const periods = beginPeriod(state.periods, at);
      const firstChaser = cmd.chasing ?? state.firstChaser!;
      const chasing = chaserInTurn(firstChaser, periods.number);
      return {
        state: {
          ...state,
          phase: 'playing',
          periods,
          firstChaser,
          chasing,
          turnPoints: [...state.turnPoints, [0, 0]],
        },
        facts: [{ type: 'turn_started', data: { turn: periods.number, chasing } }],
      };
    }
    case 'end_turn': {
      const next = { ...state, periods: endPeriod(state.periods, at) };
      const facts: DomainFact[] = [{ type: 'turn_ended', data: { turn } }];
      if (turn < totalTurns(state.config)) return { state: { ...next, phase: 'break' }, facts };
      return { state: finish(next, facts), facts };
    }
    case 'start_clock':
      return { state: { ...state, periods: runPeriodClock(state.periods, at) }, facts: [] };
    case 'stop_clock':
      return { state: { ...state, periods: holdPeriodClock(state.periods, at) }, facts: [] };
    case 'out': {
      const chasing = state.chasing!;
      const record: OutRecord = {
        chasing,
        kind: cmd.kind,
        chaserId: cmd.chaserId ?? null,
        defenderId: cmd.defenderId ?? null,
        turn,
        atMs: periodElapsed(state.periods, at),
      };
      const next = addPoints(
        { ...state, outs: [...state.outs, record] },
        chasing,
        state.config.pointsPerOut,
      );
      const facts: DomainFact[] = [{ type: 'out', data: { side: chasing, kind: cmd.kind } }];
      const { outInBatch, batch } = batchView(next);
      if (outInBatch === 0)
        facts.push({ type: 'batch_out', data: { side: other(chasing), batch: batch - 1 } });
      return { state: next, facts };
    }
    case 'technical':
      return {
        state: addPoints(
          { ...state, technicals: [...state.technicals, { side: cmd.side, points: cmd.points }] },
          cmd.side,
          cmd.points,
        ),
        facts: [{ type: 'technical', data: { side: cmd.side, points: cmd.points } }],
      };
    case 'final_whistle': {
      const facts: DomainFact[] = [];
      const next = state.periods.ended
        ? state
        : { ...state, periods: endPeriod(state.periods, at) };
      return { state: finish(next, facts), facts };
    }
    case 'concede': {
      const winner = other(cmd.side);
      return {
        state: {
          ...state,
          periods: holdPeriodClock(state.periods, at),
          phase: 'complete',
          outcome: { winner, finish: cmd.reason },
        },
        facts: [{ type: 'match_won', data: { side: winner } }],
      };
    }
  }
}

/** Pausing the match stops the turn clock (ADR 0006); the scorer restarts it with play. */
function onLifecycle(state: KhoKhoState, action: string, ctx: ApplyContext): KhoKhoState {
  if (state.phase !== 'playing') return state;
  if (action === 'PAUSE' || action === 'ABANDON') {
    return { ...state, periods: holdPeriodClock(state.periods, ctx.occurredAt) };
  }
  return state;
}

function commands(state: KhoKhoState): CommandDescriptor[] {
  const list: Record<KhoKhoState['phase'], KhoKhoCommand['type'][]> = {
    pre_match: ['start_turn', 'concede'],
    playing: [
      'out',
      'technical',
      periodClockRunning(state.periods) ? 'stop_clock' : 'start_clock',
      'end_turn',
      'concede',
    ],
    break: ['start_turn', 'technical', 'concede'],
    complete: [],
  };
  return list[state.phase].map((type) => ({ type, label: type }));
}

function result(state: KhoKhoState): MatchResult {
  const summary = `${state.score[0]}–${state.score[1]}`;
  if (!state.outcome) return { status: 'in_progress', summary };
  const { winner, finish: how } = state.outcome;
  if (winner === null) return { status: 'drawn', summary };
  return {
    status: 'won',
    winnerSide: winner,
    summary: how === 'played' ? summary : `${summary} (${how})`,
  };
}

function stats(state: KhoKhoState): MetricRecord[] {
  const records: MetricRecord[] = ([0, 1] as const).flatMap((side) => [
    { metric: 'points_for', value: state.score[side], side },
    { metric: 'points_against', value: state.score[other(side)], side },
    { metric: 'defenders_out', value: state.outs.filter((o) => o.chasing === side).length, side },
  ]);
  for (const side of [0, 1] as const) {
    for (const participantId of state.players[side]) {
      const add = (metric: string, value: number) =>
        records.push({ metric, value, side, participantId });
      add('outs_made', state.outs.filter((o) => o.chaserId === participantId).length);
      add(
        'pole_dives',
        state.outs.filter((o) => o.chaserId === participantId && o.kind === 'pole_dive').length,
      );
      add('times_out', state.outs.filter((o) => o.defenderId === participantId).length);
      add('appearances', 1);
    }
  }
  return records;
}

export const khoKhoEngine: SportEngine<KhoKhoState, KhoKhoSettings, KhoKhoCommand> = {
  sport: 'kho-kho',
  version: 1,
  settingsSchema: khoKhoSettingsSchema,
  commandSchema: khoKhoCommandSchema,
  presets: khoKhoPresets,
  validateSetup,
  init,
  commands,
  validate,
  apply,
  onLifecycle,
  isComplete: (state) => state.phase === 'complete',
  result,
  stats,
  ruleCatalogue: khoKhoRuleCatalogue,
  ruleVariables: khoKhoRuleVariables,
};
