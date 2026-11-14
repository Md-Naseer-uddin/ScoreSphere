import type { Rule, SportKey } from '@scoresphere/contracts';
import { type LedgerEvent, replay, type TimelineEntry } from '@scoresphere/engine-kit';
import type { AnySportEngine } from './engines.js';

type Ids = [string[], string[]];
type Command = { type: string } & Record<string, unknown>;

/** A short scripted game per sport, to show what rules would do (plan M8 "preview"). */
interface RuleSample {
  playersPerSide(config: Record<string, unknown>): number;
  commands(config: Record<string, unknown>, ids: Ids): Command[];
}

const rallies = (type: string, key: string, winners: number[]): Command[] =>
  winners.map((w) => ({ type, [key]: w }));

const pairOrSingle = (config: Record<string, unknown>) => (config.discipline === 'doubles' ? 2 : 1);

const SAMPLES: Partial<Record<SportKey, RuleSample>> = {
  cricket: {
    playersPerSide: (config) => Math.min(3, Number(config.playersPerSide)),
    commands: (config, ids) => {
      const ball = (kind: string, runs = 0, boundary = false): Command => ({
        type: 'delivery',
        kind,
        runs,
        boundary,
      });
      const legal = [ball('bat', 1), ball('bat', 4, true), ball('bat', 0), ball('bat', 6, true)];
      const balls = [ball('wide'), ball('wide'), ball('wide'), ...legal.slice(0, 2), ball('wide')];
      balls.push(...legal.slice(2), ball('bat', 2), ball('bat', 0));
      if (ids[0].length > 2) {
        balls.push({ ...ball('bat'), wicket: { kind: 'bowled', batterId: ids[0][0]! } });
      }
      // Stop at the end of the first over, whatever its length.
      let count = 0;
      const over = balls.filter((b) => {
        if (count >= Number(config.ballsPerOver)) return false;
        if (b.kind !== 'wide') count += 1;
        return true;
      });
      return [
        { type: 'start_innings', battingSide: 0, strikerId: ids[0][0], nonStrikerId: ids[0][1] },
        { type: 'set_bowler', bowlerId: ids[1][0] },
        ...over,
      ];
    },
  },
  badminton: {
    playersPerSide: pairOrSingle,
    commands: () => [
      { type: 'start_game', servingSide: 0 },
      ...rallies('rally', 'winner', [0, 0, 0, 1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 1, 0]),
    ],
  },
  tennis: {
    playersPerSide: pairOrSingle,
    commands: () => [
      { type: 'start_match', servingSide: 0 },
      ...rallies('point', 'winner', [0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 1, 0, 0, 1, 0, 1, 1]),
    ],
  },
  volleyball: {
    playersPerSide: (config) => Number(config.playersOnCourt),
    commands: (_config, ids) => [
      { type: 'start_set', servingSide: 0, lineups: ids },
      ...rallies('rally', 'winner', [0, 0, 1, 1, 1, 0, 0, 0]),
      { type: 'timeout', side: 1 },
      ...rallies('rally', 'winner', [1, 0, 1, 1, 0, 0, 1, 0]),
    ],
  },
  football: {
    playersPerSide: (config) => Math.min(3, Number(config.playersOnField)),
    commands: (_config, ids) => {
      const goal = (side: 0 | 1, scorer: number, kind = 'regular'): Command => ({
        type: 'goal',
        side,
        kind,
        scorerId: ids[side][scorer],
      });
      return [
        { type: 'start_period', lineups: ids },
        goal(0, 0),
        { type: 'card', side: 1, playerId: ids[1][1], color: 'yellow' },
        goal(1, 0, 'penalty'),
        goal(0, 1),
        { type: 'end_period' },
        { type: 'start_period' },
        goal(0, 0),
        { type: 'card', side: 1, playerId: ids[1][1], color: 'yellow' },
        goal(1, 0),
        { type: 'end_period' },
      ];
    },
  },
  chess: {
    playersPerSide: () => 1,
    commands: () => [
      { type: 'start_clock', whiteSide: 0 },
      ...Array.from({ length: 12 }, (_, i) => ({ type: 'press', side: i % 2 })),
    ],
  },
};

export interface RulePreview {
  /** Scoring events of the sample with what the rules did on each. */
  timeline: TimelineEntry<Command>[];
  summary: string;
  /** The same sample without the rules, for comparison. */
  summaryWithout: string;
  /** Participant IDs used, side by side, so screens can name them. */
  ids: Ids;
}

/** A fixed, valid UUIDv7-shaped ID for sample players. */
const sampleId = (side: number, i: number) =>
  `018f0000-0000-7000-8000-${String(900 + side * 10 + i).padStart(12, '0')}`;

/**
 * Runs the sport's sample game under `config`, with and without `rules`. The sample stops
 * at the first event these settings don't allow, so short formats still preview cleanly.
 */
export function previewRules(
  engine: AnySportEngine,
  config: Record<string, unknown>,
  rules: Rule[],
): RulePreview | null {
  const sample = SAMPLES[engine.sport as SportKey];
  if (!sample) return null;
  const n = sample.playersPerSide(config);
  const ids: Ids = [
    Array.from({ length: n }, (_, i) => sampleId(0, i)),
    Array.from({ length: n }, (_, i) => sampleId(1, i)),
  ];
  const run = (withRules: Rule[]) => {
    const events: LedgerEvent[] = [
      {
        seq: 1,
        kind: 'CREATED',
        occurredAt: 0,
        payload: {
          sport: engine.sport,
          presetKey: 'preview',
          presetVersion: 1,
          config,
          roster: { sides: ids.map((participantIds, side) => ({ side, participantIds })) },
          ...(withRules.length ? { rules: withRules } : {}),
        },
      },
      { seq: 2, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
    ];
    let last = replay(engine, events);
    if (!last.ok) return null;
    for (const payload of sample.commands(config, ids)) {
      const seq = events.length + 1;
      const next = replay(engine, [
        ...events,
        { seq, kind: 'COMMAND', occurredAt: seq * 1000, payload },
      ]);
      if (!next.ok) break;
      events.push({ seq, kind: 'COMMAND', occurredAt: seq * 1000, payload });
      last = next;
      if (next.value.status === 'completed') break;
    }
    return last.value;
  };
  const withRules = run(rules);
  const without = run([]);
  if (!withRules || !without) return null;
  return {
    timeline: withRules.timeline.filter((t) => t.kind === 'COMMAND') as TimelineEntry<Command>[],
    summary: engine.result(withRules.state).summary,
    summaryWithout: engine.result(without.state).summary,
    ids,
  };
}
