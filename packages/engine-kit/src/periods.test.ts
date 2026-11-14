import { describe, expect, it } from 'vitest';
import {
  beginPeriod,
  endPeriod,
  holdPeriodClock,
  matchMinute,
  minuteText,
  newPeriodClock,
  periodClockRunning,
  periodElapsed,
  runPeriodClock,
} from './periods.js';

describe('period clock', () => {
  it('runs each period from its start, holding while stopped', () => {
    let p = beginPeriod(newPeriodClock(), 1_000);
    expect(p.number).toBe(1);
    expect(periodClockRunning(p)).toBe(true);
    p = holdPeriodClock(p, 61_000);
    expect(periodElapsed(p, 500_000)).toBe(60_000);
    p = runPeriodClock(p, 100_000);
    expect(periodElapsed(p, 130_000)).toBe(90_000);
    p = endPeriod(p, 130_000);
    expect(p.ended).toBe(true);
    // Between periods nothing runs, and holding or running changes nothing.
    expect(runPeriodClock(p, 200_000)).toBe(p);
    expect(periodElapsed(p, 900_000)).toBe(90_000);
    p = beginPeriod(p, 1_000_000);
    expect(p.number).toBe(2);
    expect(periodElapsed(p, 1_030_000)).toBe(30_000);
  });

  it('gives football-style minutes with added time', () => {
    expect(matchMinute(0, 45, 0)).toEqual({ minute: 1, added: 0 });
    expect(matchMinute(0, 45, 44 * 60_000 + 59_999)).toEqual({ minute: 45, added: 0 });
    expect(matchMinute(0, 45, 46 * 60_000 + 5_000)).toEqual({ minute: 45, added: 2 });
    expect(matchMinute(45, 45, 10 * 60_000)).toEqual({ minute: 56, added: 0 });
    expect(minuteText({ minute: 45, added: 2 })).toBe("45+2'");
    expect(minuteText({ minute: 56, added: 0 })).toBe("56'");
  });
});
