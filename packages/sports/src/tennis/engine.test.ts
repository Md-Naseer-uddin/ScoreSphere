import { append, type LedgerEvent, replay } from '@scoresphere/engine-kit';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { tennisPlayerOfTheMatch } from './awards.js';
import { gameCall, tennisSetsWon, tennisEngine as engine, type TennisState } from './engine.js';
import { runTennisGoldenLog, tennisParticipantId } from './golden/run.js';
import { tennisPresets, type TennisSettings } from './settings.js';

const bo3 = { ...tennisPresets[0]!.config, discipline: 'singles' } as TennisSettings;
const play = (script: string[], config: TennisSettings = bo3) =>
  runTennisGoldenLog({
    name: 'test',
    source: 'test',
    config,
    players:
      config.discipline === 'singles'
        ? { A: ['a'], B: ['b'] }
        : { A: ['a1', 'a2'], B: ['b1', 'b2'] },
    script,
    expected: { summary: '', winner: null },
  });

describe('rules', () => {
  it('needs the first servers of both sides in doubles', () => {
    const run = play([], { ...bo3, discipline: 'doubles' });
    expect(engine.validate(run.projection.state, { type: 'start_match', servingSide: 0 }).ok).toBe(
      false,
    );
  });

  it('refuses points before the first server is chosen', () => {
    const run = play([]);
    expect(engine.validate(run.projection.state, { type: 'point', winner: 0 }).ok).toBe(false);
  });

  it('plays an advantage deciding set on past 6–6', () => {
    const config: TennisSettings = { ...bo3, setsToWin: 1, finalSet: { type: 'advantage' } };
    const run = play(
      ['start A', 'gA gB*1', 'gA gB', 'gA gB', 'gA gB', 'gA gB', 'gA gB', 'gA'],
      config,
    );
    expect(run.projection.state.game.kind).toBe('standard');
    expect(run.projection.status).toBe('live');
    const done = play(
      ['start A', 'gA gB', 'gA gB', 'gA gB', 'gA gB', 'gA gB', 'gA gB', 'gA gA'],
      config,
    );
    expect(engine.result(done.projection.state).summary).toBe('8–6');
  });

  it('calls deuce and advantage', () => {
    expect(gameCall(play(['start A', 'A A B']).projection.state)).toEqual({
      kind: 'points',
      values: ['30', '15'],
    });
    expect(gameCall(play(['start A', 'A A A B B B']).projection.state)).toEqual({ kind: 'deuce' });
    expect(gameCall(play(['start A', 'A A A B B B B']).projection.state)).toEqual({
      kind: 'advantage',
      side: 1,
    });
  });

  it('changes ends after the first and third games', () => {
    const run = play(['start A', 'gA gA gA']);
    const changes = run.projection.timeline
      .flatMap((t) => t.facts)
      .filter((f) => f.type === 'change_ends');
    expect(changes).toHaveLength(2);
  });

  it('records a walkover without an automatic award', () => {
    const run = play(['concede B walkover']);
    const { state } = run.projection;
    expect(engine.result(state)).toMatchObject({ winnerSide: 0, summary: 'Walkover' });
    expect(tennisPlayerOfTheMatch.compute(state, engine.stats(state))).toBeNull();
  });
});

describe('properties', () => {
  const configArb = fc.record({
    preset: fc.constantFrom(...tennisPresets.map((p) => p.config)),
    noAd: fc.boolean(),
  });

  function simulate(config: TennisSettings, winners: (0 | 1 | 'undo')[]) {
    const ids = [tennisParticipantId(0), tennisParticipantId(1)];
    const events: LedgerEvent[] = [
      {
        seq: 1,
        kind: 'CREATED',
        occurredAt: 0,
        payload: {
          sport: 'tennis',
          presetKey: 'p',
          presetVersion: 1,
          config,
          roster: {
            sides: [
              { side: 0, participantIds: [ids[0]] },
              { side: 1, participantIds: [ids[1]] },
            ],
          },
        },
      },
      { seq: 2, kind: 'LIFECYCLE', occurredAt: 0, payload: { action: 'START' } },
      { seq: 3, kind: 'COMMAND', occurredAt: 0, payload: { type: 'start_match', servingSide: 0 } },
    ];
    const r = replay(engine, events);
    if (!r.ok) throw new Error(r.error.message);
    let p = r.value;
    const states: TennisState[] = [];
    for (const w of winners) {
      if (p.status === 'completed') break;
      const seq = events.length + 1;
      let e: LedgerEvent;
      if (w === 'undo') {
        const last = [...p.timeline]
          .reverse()
          .find((t) => !t.voidedBy && t.command?.type === 'point');
        if (!last) continue;
        e = { seq, occurredAt: seq, kind: 'VOID', targetSeq: last.seq, payload: {} };
      } else {
        e = { seq, occurredAt: seq, kind: 'COMMAND', payload: { type: 'point', winner: w } };
      }
      const next = append(engine, p, events, e);
      if (next.ok) {
        p = next.value;
        events.push(e);
        states.push(p.state);
      }
    }
    return { events, p, states };
  }

  function checkInvariants(state: TennisState) {
    const { config } = state;
    const won = tennisSetsWon(state);
    expect(Math.max(...won)).toBeLessThanOrEqual(config.setsToWin);
    state.sets.forEach((set) => {
      if (set.winner === null) return;
      const w = set.games[set.winner];
      const l = set.games[1 - set.winner]!;
      if (set.matchTiebreak) {
        const [p, q] = [set.tiebreak![set.winner], set.tiebreak![1 - set.winner]!];
        expect(p - q).toBeGreaterThanOrEqual(2);
      } else if (set.tiebreak) {
        expect([w, l]).toEqual([config.gamesPerSet + 1, config.gamesPerSet]);
      } else {
        expect(w).toBeGreaterThanOrEqual(config.gamesPerSet);
        expect(w - l).toBeGreaterThanOrEqual(2);
      }
    });
    // Service rotates exactly once per game played.
    if (state.phase === 'playing') expect(state.game.serverIndex).toBe(state.gamesPlayed);
    const [a, b] = state.game.points;
    if (state.game.kind === 'standard')
      expect(Math.abs(a - b)).toBeLessThanOrEqual(config.noAd ? 4 : Math.max(a, b) >= 4 ? 1 : 4);
  }

  const stepArb = fc.oneof(
    { weight: 15, arbitrary: fc.constantFrom<0 | 1>(0, 1) },
    { weight: 1, arbitrary: fc.constant<'undo'>('undo') },
  );

  it('keeps sets, games and service legal through any points and undos', () => {
    fc.assert(
      fc.property(configArb, fc.array(stepArb, { maxLength: 600 }), ({ preset, noAd }, steps) => {
        const { states } = simulate({ ...preset, noAd, discipline: 'singles' }, steps);
        states.forEach(checkInvariants);
      }),
      { numRuns: 80 },
    );
  });

  it('replays to the state reached by incremental appends', () => {
    fc.assert(
      fc.property(configArb, fc.array(stepArb, { maxLength: 400 }), ({ preset, noAd }, steps) => {
        const { events, p } = simulate({ ...preset, noAd, discipline: 'singles' }, steps);
        const r = replay(engine, events);
        expect(r.ok && r.value.state).toEqual(p.state);
      }),
      { numRuns: 60 },
    );
  });
});
