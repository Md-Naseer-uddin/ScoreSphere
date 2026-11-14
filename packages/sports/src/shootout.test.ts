import { describe, expect, it } from 'vitest';
import { type ShootoutAttempt, shootoutNext, shootoutWinner } from './shootout.js';

const attempts = (first: 0 | 1, results: boolean[]): ShootoutAttempt[] =>
  results.map((scored, i) => ({ side: shootoutNext(first, i), scored }));

describe('shootouts', () => {
  it('alternate from the first side', () => {
    expect([0, 1, 2, 3].map((n) => shootoutNext(1, n))).toEqual([1, 0, 1, 0]);
  });

  it('end early once one side cannot catch up', () => {
    // A scores three, B misses three: B could reach only 2.
    expect(shootoutWinner(5, attempts(0, [true, false, true, false, true]))).toBeNull();
    expect(shootoutWinner(5, attempts(0, [true, false, true, false, true, false]))).toBe(0);
  });

  it('go to sudden death after the set attempts', () => {
    const level = attempts(
      0,
      Array.from({ length: 10 }, () => true),
    );
    expect(shootoutWinner(5, level)).toBeNull();
    expect(shootoutWinner(5, [...level, { side: 0, scored: false }])).toBeNull();
    expect(
      shootoutWinner(5, [...level, { side: 0, scored: false }, { side: 1, scored: true }]),
    ).toBe(1);
  });
});
