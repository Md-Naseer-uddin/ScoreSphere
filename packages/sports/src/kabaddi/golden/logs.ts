import type { Rule } from '@scoresphere/contracts';
import { kabaddiPresets, type KabaddiSettings } from '../settings.js';

/**
 * Kabaddi golden logs: a script of raids and the result it must produce (plan §4).
 * Expectations were worked out by hand from the rules, independently of the engine.
 *
 * Script lines (players are `a1…` for side A and `b1…` for side B):
 * - `start A` (A raids first), `start` (a later half), `end`, `stop`, `go`
 * - `raid A a1 safe 2 [bonus] [b1 b2]`: raider a1 got back after touching 2 (optionally named)
 * - `raid A a2 tackled [bonus] [by b3]`, `raid A - out` (raider not named)
 * - `out B b2` (a player out of bounds), `tech A 1`, `timeout A`, `whistle`
 */
export interface KabaddiGoldenLog {
  name: string;
  source: string;
  config: KabaddiSettings;
  rules?: Rule[];
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    summary: string;
    winner: 'A' | 'B' | null;
    allOuts?: [number, number];
    onMat?: [number, number];
    players?: Record<string, Record<string, number>>;
  };
}

const config = (key: string): KabaddiSettings => kabaddiPresets.find((p) => p.key === key)!.config;
const seven = (s: string) => Array.from({ length: 7 }, (_, i) => `${s}${i + 1}`);

export const kabaddiGoldenLogs: KabaddiGoldenLog[] = [
  {
    name: 'Revivals, an all out, a super tackle and two do-or-die raids',
    source: 'constructed',
    config: config('modern-2x20'),
    players: { A: seven('a'), B: seven('b') },
    script: [
      'start A',
      'raid A a1 safe 2',
      'raid B b1 safe 0',
      // A loses a raider; B revives one of its two out players.
      'raid A a2 tackled by b3',
      'raid B b2 safe 0',
      // Six defenders: the bonus line counts.
      'raid A a1 safe 1 bonus',
      // B's third raid after two empty ones is do-or-die: empty, so b3 is out.
      'raid B b3 safe 0',
      // The last four B players are touched: all out, 2 more points, and B comes back.
      'raid A a3 safe 4',
      'raid B b4 safe 3',
      'raid A a4 safe 0',
      'raid B b5 safe 1',
      'raid A a5 safe 0',
      // Three A defenders tackle the raider: a super tackle, 2 points.
      'raid B b6 tackled by a6',
      'end',
      'start',
      'raid B b7 safe 1',
      // A's do-or-die raid fails.
      'raid A a7 safe 0',
      'out A a1',
      'tech B 1',
      'end',
    ],
    expected: {
      summary: '13–9',
      winner: 'A',
      allOuts: [1, 0],
      onMat: [1, 7],
      players: {
        a1: { raid_points: 4, touch_points: 3, bonus_points: 1, raids: 2 },
        a3: { raid_points: 4, super_raids: 1 },
        a6: { tackle_points: 2, super_tackles: 1 },
        b3: { tackle_points: 1, raids: 1, raid_points: 0 },
        b4: { raid_points: 3, super_raids: 1 },
      },
    },
  },
  {
    name: 'Classic rules with two players a side: all outs both ways and a draw',
    source: 'constructed',
    config: config('classic-2x20'),
    players: { A: ['a1', 'a2'], B: ['b1', 'b2'] },
    script: [
      'start B',
      'raid B b1 safe 1',
      // A's last player is tackled: all out to B.
      'raid A a1 tackled',
      'raid B b2 safe 0',
      'raid A a2 safe 2',
      'end',
      'start',
      'end',
    ],
    expected: { summary: '4–4', winner: null, allOuts: [1, 1], onMat: [2, 2] },
  },
];
