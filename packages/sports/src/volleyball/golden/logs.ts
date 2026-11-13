import type { VolleyballSettings } from '../settings.js';

/**
 * Volleyball golden logs. Script lines:
 * - `set A a1 a2 a3 | b1 b2 b3`: start a set with A serving, then each line-up from position I
 * - rallies: `A`, `B`, credited `A:a1:attack` / `A:a2:block` / `A:a1:ace`, repeat with `*n`
 * - `sub A a3 a4`, `timeout B`, `concede B retired`
 */
export interface VolleyballGoldenLog {
  name: string;
  source: string;
  config: VolleyballSettings;
  players: { A: string[]; B: string[] };
  script: string[];
  expected: {
    summary: string;
    winner: 'A' | 'B' | null;
    /** Server before each rally of the first set. */
    servers?: string[];
    awards?: { mvp?: string[]; bestSpiker?: string[]; bestBlocker?: string[] };
  };
}

const small: VolleyballSettings = {
  setsToWin: 2,
  pointsPerSet: 5,
  decidingSetPoints: 3,
  winBy: 2,
  cap: null,
  playersOnCourt: 3,
  substitutionsPerSet: 2,
  timeoutsPerSet: 1,
  deciderChangeEndsAt: 2,
};

export const volleyballGoldenLogs: VolleyballGoldenLog[] = [
  {
    name: 'Rotation on side-outs, alternating first serve and a deciding set',
    source: 'constructed',
    config: small,
    players: { A: ['a1', 'a2', 'a3', 'a4'], B: ['b1', 'b2', 'b3'] },
    script: [
      'set A a1 a2 a3 | b1 b2 b3',
      'A B B A A A A',
      // The team that received first in set 1 serves first in set 2.
      'set B a1 a2 a3 | b1 b2 b3',
      'B*5',
      // Deciding set: a new toss.
      'set A a1 a2 a3 | b1 b2 b3',
      'A B A A',
    ],
    expected: {
      summary: '5–2, 0–5, 3–1',
      winner: 'A',
      servers: ['a1', 'a1', 'b2', 'b2', 'a2', 'a2', 'a2'],
    },
  },
  {
    name: 'Credited points decide the player awards',
    source: 'constructed',
    config: { ...small, setsToWin: 1, decidingSetPoints: 5 },
    players: { A: ['a1', 'a2', 'a3'], B: ['b1', 'b2', 'b3'] },
    script: [
      'set A a1 a2 a3 | b1 b2 b3',
      'A:a1:ace A:a2:attack B:b2:block A A:a2:attack A:a3:block',
    ],
    expected: {
      summary: '5–1',
      winner: 'A',
      awards: { mvp: ['a2'], bestSpiker: ['a2'], bestBlocker: ['a3'] },
    },
  },
];
