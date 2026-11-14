import type { Rule } from '@scoresphere/contracts';
import { footballPresets, type FootballSettings } from '../settings.js';

/**
 * Football golden logs: a script of match events and the result it must produce (plan §4).
 * Expectations were worked out by hand from the Laws, independently of the engine.
 *
 * Script lines (players are `a1…` for side A and `b1…` for side B):
 * - `kickoff a1 a2 | b1 b2` starts the match with those lineups; `start` starts a later period
 * - `@mm:ss` before an event sets how far into the current period it happened
 * - `goal A a1 [assist a2]`, `goal A` (scorer not recorded), `pen A a1`, `og A b2`
 *   (an own goal for A by b2)
 * - `yellow B b2`, `red A a1`, `sub A a3>a4` (a3 off, a4 on), `end` (end of period)
 * - `shootout B` (B kicks first), `kick A a1 in|out`, `kick A - in` (kicker not recorded)
 * - `whistle` (final whistle now), `concede A forfeit|walkover`
 */
export interface FootballGoldenLog {
  name: string;
  source: string;
  config: FootballSettings;
  rules?: Rule[];
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    summary: string;
    winner: 'A' | 'B' | null;
    /** "a1 12' (a2)", "b3 45+1' pen", "b4 66' og", "? 30'" for an unrecorded scorer */
    goals?: string[];
    /** "b2 yellow 31'", "b2 red 86' (second yellow)" */
    cards?: string[];
    /** Player statistics to check, e.g. { a1: { goals: 1 } } */
    players?: Record<string, Record<string, number>>;
  };
}

const config = (key: string): FootballSettings =>
  footballPresets.find((p) => p.key === key)!.config;

export const footballGoldenLogs: FootballGoldenLog[] = [
  {
    name: 'League match: added time, a penalty, an own goal and a second yellow',
    source: 'constructed',
    config: config('ifab-90'),
    players: { A: ['a1', 'a2', 'a3', 'a4', 'a5'], B: ['b1', 'b2', 'b3', 'b4', 'b5'] },
    script: [
      'kickoff a1 a2 a3 a4 | b1 b2 b3 b4',
      '@11:20 goal A a1 assist a2',
      '@30:00 yellow B b2',
      // 45 minutes and 30 seconds in: the first minute of added time.
      '@45:30 pen B b3',
      '@46:10 end',
      'start',
      '@05:00 sub A a4>a5',
      '@20:00 og A b4',
      '@40:00 yellow B b2',
      '@47:59 end',
    ],
    expected: {
      summary: '2–1',
      winner: 'A',
      goals: ["a1 12' (a2)", "b3 45+1' pen", "b4 66' og"],
      cards: ["b2 yellow 31'", "b2 yellow 86' (second yellow)"],
      players: {
        a1: { goals: 1, assists: 0, appearances: 1 },
        a2: { assists: 1 },
        b3: { goals: 1, penalty_goals: 1 },
        b4: { goals: 0, own_goals: 1 },
        b2: { yellow_cards: 2, red_cards: 1 },
        a5: { appearances: 1 },
        b5: { appearances: 0 },
      },
    },
  },
  {
    name: 'Knockout: level after 90, extra time, then penalties won in the fifth round',
    source: 'constructed',
    config: config('ifab-knockout'),
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'kickoff a1 a2 a3 | b1 b2 b3',
      '@10:00 goal A a1',
      '@45:00 end',
      'start',
      '@30:00 goal B b1',
      '@45:00 end',
      'start',
      '@14:00 end',
      'start',
      '@15:00 end',
      'shootout B',
      'kick B b1 in',
      'kick A a1 in',
      'kick B b2 out',
      'kick A a2 in',
      'kick B b3 in',
      'kick A a3 out',
      'kick B b1 in',
      'kick A a1 in',
      // After B's miss, A's fifth kick decides it 4–3.
      'kick B b2 out',
      'kick A a2 in',
    ],
    expected: {
      summary: '1–1 (4–3 pens)',
      winner: 'A',
      goals: ["a1 11'", "b1 76'"],
    },
  },
  {
    name: 'Local knockout: a red card, rolling substitutes and a shootout decided early',
    source: 'constructed',
    config: config('local-knockout'),
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'kickoff a1 a2 | b1 b2',
      '@05:00 red A a2',
      '@12:00 sub B b2>b3',
      // Rolling substitutes: b2 comes back on.
      '@15:00 sub B b3>b2',
      '@20:00 end',
      'start',
      '@19:00 end',
      'shootout A',
      'kick A a1 in',
      'kick B b1 out',
      'kick A a3 in',
      'kick B b2 out',
      'kick A a1 in',
      // B can now reach only 2 of A's 3: decided after three rounds.
      'kick B b1 out',
    ],
    expected: {
      summary: '0–0 (3–0 pens)',
      winner: 'A',
      cards: ["a2 red 6'"],
      players: { a2: { red_cards: 1 }, b3: { appearances: 1 } },
    },
  },
  {
    name: 'A league draw, with a goal whose scorer was not recorded',
    source: 'constructed',
    config: config('school-60'),
    players: { A: ['a1'], B: ['b1'] },
    script: [
      'kickoff a1 | b1',
      '@29:00 goal A',
      '@30:30 end',
      'start',
      '@02:00 goal B b1',
      '@31:00 end',
    ],
    expected: { summary: '1–1', winner: null, goals: ["? 30'", "b1 33'"] },
  },
  {
    name: 'Golden goal as a custom rule: the first goal in extra time ends the match (M8)',
    source: 'constructed',
    config: { ...config('ifab-knockout'), shootout: { kicks: 5 } },
    rules: [
      {
        id: 'golden-goal',
        name: 'Golden goal',
        priority: 50,
        trigger: 'goal',
        conditions: [{ source: 'fact', key: 'extra', op: 'eq', value: true }],
        actions: [{ command: 'final_whistle', params: {} }],
      },
    ],
    players: { A: ['a1'], B: ['b1'] },
    script: ['kickoff a1 | b1', '@45:00 end', 'start', '@45:00 end', 'start', '@07:30 goal B b1'],
    expected: { summary: '0–1 a.e.t.', winner: 'B', goals: ["b1 98'"] },
  },
];
