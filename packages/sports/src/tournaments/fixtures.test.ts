import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { roundRobin, seedOrder, singleElimination } from './fixtures.js';

const ids = (n: number) => Array.from({ length: n }, (_, i) => `e${i + 1}`);

describe('round robin', () => {
  it('meets everyone exactly once, nobody twice in a round', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 16 }), (n) => {
        const fixtures = roundRobin(ids(n));
        expect(fixtures).toHaveLength((n * (n - 1)) / 2);
        const pairs = new Set(fixtures.map((f) => [f.side1, f.side2].sort().join('-')));
        expect(pairs.size).toBe(fixtures.length);
        const rounds = new Set(fixtures.map((f) => f.round));
        expect(rounds.size).toBe(n % 2 === 0 ? n - 1 : n);
        for (const round of rounds) {
          const playing = fixtures
            .filter((f) => f.round === round)
            .flatMap((f) => [f.side1, f.side2]);
          expect(new Set(playing).size).toBe(playing.length);
        }
      }),
    );
  });

  it('is deterministic', () => {
    expect(roundRobin(ids(5))).toEqual(roundRobin(ids(5)));
  });
});

describe('single elimination', () => {
  it('places seeds so the top two can only meet in the final', () => {
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('gives byes to the top seeds and advances them at once', () => {
    const fixtures = singleElimination(ids(6));
    const first = fixtures.filter((f) => f.round === 1);
    expect(first.filter((f) => f.bye).map((f) => f.side1)).toEqual(['e1', 'e2']);
    const semis = fixtures.filter((f) => f.round === 2);
    expect(
      semis
        .flatMap((f) => [f.side1, f.side2])
        .filter(Boolean)
        .sort(),
    ).toEqual(['e1', 'e2']);
    expect(fixtures.filter((f) => f.round === 3)).toHaveLength(1);
  });

  it('has n − 1 real matches for any field', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 40 }), (n) => {
        const fixtures = singleElimination(ids(n));
        expect(fixtures.filter((f) => !f.bye)).toHaveLength(n - 1);
        const first = fixtures
          .filter((f) => f.round === 1)
          .flatMap((f) => [f.side1, f.side2])
          .filter(Boolean);
        expect(new Set(first).size).toBe(n);
      }),
    );
  });
});
