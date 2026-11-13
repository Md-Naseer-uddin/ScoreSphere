import { describe, expect, it } from 'vitest';
import { clockElapsed, formatClock, newClock, startClock, stopClock } from './clock.js';

describe('clock', () => {
  it('accumulates only while running', () => {
    let c = startClock(newClock(), 1_000);
    expect(clockElapsed(c, 4_000)).toBe(3_000);
    c = stopClock(c, 5_000);
    expect(clockElapsed(c, 60_000)).toBe(4_000);
    c = startClock(c, 10_000);
    expect(clockElapsed(c, 10_500)).toBe(4_500);
  });

  it('ignores a device clock that moved backwards', () => {
    const c = stopClock(startClock(newClock(), 5_000), 4_000);
    expect(c.elapsedMs).toBe(0);
  });

  it('starting a running clock or stopping a stopped one changes nothing', () => {
    const running = startClock(newClock(), 1);
    expect(startClock(running, 99)).toBe(running);
    const stopped = newClock();
    expect(stopClock(stopped, 99)).toBe(stopped);
  });

  it('formats for display', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(59_999)).toBe('0:59');
    expect(formatClock(5 * 60_000 + 3_000)).toBe('5:03');
    expect(formatClock(3_600_000 + 61_000)).toBe('1:01:01');
    expect(formatClock(-5)).toBe('0:00');
  });
});
