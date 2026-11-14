import type { Rule } from '@scoresphere/contracts';
import { hockeyPresets, type HockeySettings } from '../settings.js';

/**
 * Hockey golden logs: a script of match events and the result it must produce (plan §4).
 * Expectations were worked out by hand from the Rules, independently of the engine.
 *
 * Script lines (players are `a1…` for side A and `b1…` for side B):
 * - `start`, `end` a period; `stop`, `restart` the clock
 * - `@mm:ss` before an event: wall-clock time since the period started
 * - `goal A a1 [assist a2]`, `pcgoal A a1` (from a penalty corner), `goal A` (no scorer)
 * - `pc A` (penalty corner to A), `stroke A a1 in|out`
 * - `green B b2`, `yellow A a1 [minutes]`, `red A a2`
 * - `shootout A` (A goes first), `attempt A a1 in|out`, `whistle`, `concede A forfeit`
 */
export interface HockeyGoldenLog {
  name: string;
  source: string;
  config: HockeySettings;
  rules?: Rule[];
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    summary: string;
    winner: 'A' | 'B' | null;
    /** "a1 4' pc (a2)", "b1 21' ps", "? 28'" */
    goals?: string[];
    /** "b2 green 11'" */
    cards?: string[];
    penaltyCorners?: [number, number];
    players?: Record<string, Record<string, number>>;
  };
}

const config = (key: string): HockeySettings => hockeyPresets.find((p) => p.key === key)!.config;

export const hockeyGoldenLogs: HockeyGoldenLog[] = [
  {
    name: 'Four quarters: a penalty-corner goal, a stroke scored and one missed, two cards',
    source: 'constructed',
    config: { ...config('fih-4x15'), stopClock: false },
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'start',
      '@03:10 pc A',
      '@03:40 pcgoal A a1 assist a2',
      '@10:00 green B b2',
      '@15:00 end',
      'start',
      '@05:00 stroke B b1 in',
      '@15:00 end',
      'start',
      '@07:00 goal A a3',
      '@15:00 end',
      'start',
      '@01:00 yellow A a1',
      '@08:00 stroke A a2 out',
      '@15:00 end',
    ],
    expected: {
      summary: '2–1',
      winner: 'A',
      goals: ["a1 4' pc (a2)", "b1 21' ps", "a3 38'"],
      cards: ["b2 green 11'", "a1 yellow 47'"],
      penaltyCorners: [1, 0],
      players: {
        a1: { goals: 1, penalty_corner_goals: 1, yellow_cards: 1 },
        a2: { assists: 1, goals: 0 },
        a3: { field_goals: 1 },
        b1: { penalty_stroke_goals: 1 },
        b2: { green_cards: 1 },
      },
    },
  },
  {
    name: 'FIH clock stops after goals and penalty corners, then a shoot-out',
    source: 'constructed',
    config: config('fih-shootout'),
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'start',
      '@02:00 goal A a1',
      // A minute passes before the centre pass, off the clock.
      '@03:00 restart',
      '@05:00 pc B',
      '@06:00 restart',
      // 6:00 played: the seventh minute.
      '@08:00 pcgoal B b1',
      '@09:00 restart',
      '@18:00 end',
      'start',
      '@15:00 end',
      'start',
      '@15:00 end',
      'start',
      '@15:00 end',
      'shootout A',
      'attempt A a1 in',
      'attempt B b1 in',
      'attempt A a2 out',
      'attempt B b2 in',
      'attempt A a3 in',
      'attempt B b3 out',
      'attempt A a1 in',
      'attempt B b1 in',
      'attempt A a2 in',
      'attempt B b2 out',
    ],
    expected: {
      summary: '1–1 (4–3 SO)',
      winner: 'A',
      goals: ["a1 3'", "b1 7' pc"],
      penaltyCorners: [0, 1],
    },
  },
  {
    name: 'A six-a-side draw with a red card and a goal whose scorer was not recorded',
    source: 'constructed',
    config: config('six-a-side'),
    players: { A: ['a1', 'a2'], B: ['b1', 'b2'] },
    script: [
      'start',
      '@04:00 red A a2',
      '@10:00 goal B b1',
      '@15:00 end',
      'start',
      '@12:00 goal A',
      '@15:00 end',
    ],
    expected: {
      summary: '1–1',
      winner: null,
      goals: ["b1 11'", "? 28'"],
      cards: ["a2 red 5'"],
      players: { a2: { red_cards: 1 } },
    },
  },
];
