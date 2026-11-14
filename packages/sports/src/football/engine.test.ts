import { newId } from '@scoresphere/contracts';
import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type FootballCommand,
  footballEngine as engine,
  footballMinute,
  type FootballState,
} from './engine.js';
import { footballPresets, type FootballSettings } from './settings.js';

const laws = footballPresets.find((p) => p.key === 'ifab-90')!.config;
const A = [newId(), newId(), newId(), newId()];
const B = [newId(), newId(), newId(), newId()];

function ledger(config: FootballSettings, commands: (FootballCommand | 'PAUSE' | 'RESUME')[]) {
  const events: LedgerEvent[] = [
    {
      seq: 1,
      kind: 'CREATED',
      occurredAt: 0,
      payload: {
        sport: 'football',
        presetKey: 'test',
        presetVersion: 1,
        config,
        roster: {
          sides: [
            { side: 0, participantIds: A },
            { side: 1, participantIds: B },
          ],
        },
      },
    },
    { seq: 2, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
  ];
  for (const c of commands) {
    const seq = events.length + 1;
    const occurredAt = (seq - 2) * 60_000;
    events.push(
      typeof c === 'string'
        ? { seq, kind: 'LIFECYCLE', occurredAt, payload: { action: c } }
        : { seq, kind: 'COMMAND', occurredAt, payload: c },
    );
  }
  return events;
}

function play(commands: FootballCommand[], config = laws): FootballState {
  const r = replay(engine, ledger(config, commands));
  if (!r.ok) throw new Error(r.error.message);
  return r.value.state;
}

/** Whether `cmd` would be accepted after `commands`. */
function check(commands: FootballCommand[], cmd: FootballCommand, config = laws) {
  return engine.validate(play(commands, config), cmd);
}

const kickoff: FootballCommand = { type: 'start_period', lineups: [A.slice(0, 3), B.slice(0, 3)] };

describe('football engine', () => {
  it('needs lineups of the team’s own players, no more than the field allows', () => {
    expect(check([], { type: 'start_period' }).ok).toBe(false);
    expect(check([], { type: 'start_period', lineups: [[B[0]!], [B[1]!]] }).ok).toBe(false);
    expect(check([], { type: 'start_period', lineups: [[A[0]!, A[0]!], [B[0]!]] }).ok).toBe(false);
    const small = { ...laws, playersOnField: 3 };
    expect(check([], { type: 'start_period', lineups: [A, B.slice(0, 3)] }, small).ok).toBe(false);
    expect(check([], kickoff).ok).toBe(true);
  });

  it('checks who can score and assist', () => {
    const goal = (extra: Partial<Extract<FootballCommand, { type: 'goal' }>>) =>
      ({ type: 'goal', side: 0, kind: 'regular', ...extra }) as FootballCommand;
    expect(check([kickoff], goal({ scorerId: A[0] })).ok).toBe(true);
    expect(check([kickoff], goal({ scorerId: A[3] })).ok).toBe(false); // on the bench
    expect(check([kickoff], goal({ scorerId: B[0] })).ok).toBe(false);
    expect(check([kickoff], goal({ kind: 'own_goal', scorerId: B[0] })).ok).toBe(true);
    expect(check([kickoff], goal({ kind: 'own_goal', scorerId: B[0], assistId: A[1] })).ok).toBe(
      false,
    );
    expect(check([kickoff], goal({ scorerId: A[0], assistId: A[0] })).ok).toBe(false);
    expect(check([kickoff], goal({ scorerId: A[0], assistId: A[1] })).ok).toBe(true);
    // No goals at half-time.
    expect(check([kickoff, { type: 'end_period' }], goal({})).ok).toBe(false);
  });

  it('sends a player off for a second yellow, and they cannot come back', () => {
    const yellow: FootballCommand = { type: 'card', side: 1, playerId: B[0]!, color: 'yellow' };
    const state = play([kickoff, yellow, yellow]);
    expect(state.sentOff).toEqual([B[0]]);
    expect(state.onField[1]).not.toContain(B[0]);
    expect(check([kickoff, yellow, yellow], yellow).ok).toBe(false);
    expect(
      check([kickoff, yellow, yellow], { type: 'substitute', side: 1, outId: B[1]!, inId: B[0]! })
        .ok,
    ).toBe(false);
  });

  it('limits substitutions and returns unless substitutes roll', () => {
    const off: FootballCommand = { type: 'substitute', side: 0, outId: A[0]!, inId: A[3]! };
    const back: FootballCommand = { type: 'substitute', side: 0, outId: A[3]!, inId: A[0]! };
    expect(check([kickoff, off], back).ok).toBe(false);
    expect(check([kickoff, off], back, { ...laws, rollingSubstitutions: true }).ok).toBe(true);
    expect(check([kickoff], off, { ...laws, maxSubstitutions: 0 }).ok).toBe(false);
  });

  it('goes to extra time, then penalties, only when level', () => {
    const knockout = footballPresets.find((p) => p.key === 'ifab-knockout')!.config;
    const end: FootballCommand = { type: 'end_period' };
    const start: FootballCommand = { type: 'start_period' };
    const level = play([kickoff, end, start, end], knockout);
    expect(level.phase).toBe('break');
    const won = play(
      [kickoff, { type: 'goal', side: 1, kind: 'regular' }, end, start, end],
      knockout,
    );
    expect(won.outcome).toEqual({ winner: 1, finish: 'regular' });
    const pens = play([kickoff, end, start, end, start, end, start, end], knockout);
    expect(pens.phase).toBe('shootout');
    expect(
      check(
        [kickoff, end, start, end, start, end, start, end],
        {
          type: 'shootout_kick',
          side: 0,
          scored: true,
        },
        knockout,
      ).ok,
    ).toBe(false);
  });

  it('alternates penalty kicks', () => {
    const local = footballPresets.find((p) => p.key === 'local-knockout')!.config;
    const toPens: FootballCommand[] = [
      kickoff,
      { type: 'end_period' },
      { type: 'start_period' },
      { type: 'end_period' },
      { type: 'start_shootout', firstSide: 1 },
    ];
    expect(check(toPens, { type: 'shootout_kick', side: 0, scored: true }, local).ok).toBe(false);
    expect(check(toPens, { type: 'shootout_kick', side: 1, scored: true }, local).ok).toBe(true);
  });

  it('stops the clock while the match is paused', () => {
    const r = replay(engine, ledger(laws, [kickoff, 'PAUSE', 'RESUME']));
    expect(r.ok).toBe(true);
    const state = r.ok ? r.value.state : null!;
    // Kick-off at 1 min, pause at 2, resume at 3: at 10 minutes, 8 minutes have been played.
    expect(footballMinute(state, 10 * 60_000)).toEqual({ minute: 9, added: 0 });
  });

  it('keeps the score equal to the goals, through undos, replayed or appended', () => {
    const action = fc.oneof(
      fc.record({ type: fc.constant('goal' as const), side: fc.constantFrom<0 | 1>(0, 1) }),
      fc.constant({ type: 'undo' as const }),
      fc.constant({ type: 'end' as const }),
    );
    fc.assert(
      fc.property(fc.array(action, { maxLength: 30 }), (actions) => {
        const events = ledger(laws, [kickoff]);
        const p = replay(engine, events);
        if (!p.ok) throw new Error(p.error.message);
        let projection = p.value;
        const undoable: number[] = [];
        for (const a of actions) {
          const seq = events.length + 1;
          const occurredAt = seq * 60_000;
          const event: LedgerEvent =
            a.type === 'undo'
              ? { seq, kind: 'VOID', occurredAt, targetSeq: undoable.at(-1) ?? 0, payload: {} }
              : {
                  seq,
                  kind: 'COMMAND',
                  occurredAt,
                  payload:
                    a.type === 'goal'
                      ? { type: 'goal', side: a.side, kind: 'regular' }
                      : {
                          type:
                            projection.state.phase === 'playing' ? 'end_period' : 'start_period',
                        },
                };
          const next = append(engine, projection, events, event);
          if (!next.ok) continue;
          events.push(event);
          projection = next.value;
          if (a.type === 'undo') undoable.pop();
          else undoable.push(seq);
        }
        const s = projection.state;
        expect(s.score[0] + s.score[1]).toBe(s.goals.length);
        expect(s.score[0]).toBe(s.goals.filter((g) => g.side === 0).length);
        const replayed = replay(engine, events);
        expect(replayed.ok && replayed.value.state).toEqual(s);
      }),
    );
  });
});
