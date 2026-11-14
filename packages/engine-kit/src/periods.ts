import { type Clock, clockElapsed, newClock, startClock, stopClock } from './clock.js';

/**
 * Periods of play on a device-time clock (ADR 0006): football halves, hockey and basketball
 * quarters, and their extra periods. Each period has its own clock, which runs from the
 * start of the period until its end, stopping while the match is paused or, in sports
 * that stop the clock, between whistles.
 */
export interface PeriodClock {
  /** The current (or last) period, counting from 1; 0 before the first starts. */
  number: number;
  clock: Clock;
  /** Between the end of one period and the start of the next. */
  ended: boolean;
}

export const newPeriodClock = (): PeriodClock => ({ number: 0, clock: newClock(), ended: true });

/** Starts the next period with its clock running. */
export function beginPeriod(p: PeriodClock, at: number): PeriodClock {
  return { number: p.number + 1, clock: startClock(newClock(), at), ended: false };
}

export function endPeriod(p: PeriodClock, at: number): PeriodClock {
  return { ...p, clock: stopClock(p.clock, at), ended: true };
}

/** Stops the clock within a period (a pause, or a whistle where the clock stops). */
export function holdPeriodClock(p: PeriodClock, at: number): PeriodClock {
  return p.ended ? p : { ...p, clock: stopClock(p.clock, at) };
}

/** Restarts a held clock; does nothing between periods. */
export function runPeriodClock(p: PeriodClock, at: number): PeriodClock {
  return p.ended ? p : { ...p, clock: startClock(p.clock, at) };
}

export const periodClockRunning = (p: PeriodClock): boolean =>
  !p.ended && p.clock.runningSince !== null;

/** Time played in the current period at `now`. */
export function periodElapsed(p: PeriodClock, now: number): number {
  return clockElapsed(p.clock, now);
}

/**
 * The match minute of an event, football style: the first minute is 1, and time beyond a
 * period's length is added time, shown as "45+2'". `startMinute` is the minutes played in
 * earlier periods.
 */
export function matchMinute(
  startMinute: number,
  lengthMinutes: number,
  elapsedMs: number,
): { minute: number; added: number } {
  const minute = Math.floor(Math.max(0, elapsedMs) / 60_000) + 1;
  if (minute <= lengthMinutes) return { minute: startMinute + minute, added: 0 };
  return { minute: startMinute + lengthMinutes, added: minute - lengthMinutes };
}

export const minuteText = ({ minute, added }: { minute: number; added: number }): string =>
  added > 0 ? `${minute}+${added}'` : `${minute}'`;
