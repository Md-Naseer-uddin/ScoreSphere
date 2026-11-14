import { SPORT_KEYS } from '@scoresphere/contracts';
import { describe, expect, it } from 'vitest';
import { matchAwardDefinitions } from './awards.js';
import { getEngine, latestEngine } from './engines.js';

describe('award registry', () => {
  it('has a (possibly empty) award list for every scorable engine, with unique keys', () => {
    for (const sport of SPORT_KEYS) {
      const engine = latestEngine(sport);
      if (!engine) continue;
      const keys = matchAwardDefinitions(sport, engine.version).map((a) => a.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(getEngine(sport, engine.version)).toBeDefined();
    }
    expect(matchAwardDefinitions('cricket', 1).map((a) => a.key)).toEqual([
      'player-of-the-match',
      'best-batter',
      'best-bowler',
    ]);
  });
});
