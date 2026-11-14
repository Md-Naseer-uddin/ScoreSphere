import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { hockeyEngine } from './engine.js';
import { hockeyGoldenLogs } from './golden/logs.js';
import { runHockeyGoldenLog } from './golden/run.js';

const minute = (m: number, added: number) => (added ? `${m}+${added}'` : `${m}'`);
const KIND = { field_goal: '', penalty_corner: ' pc', penalty_stroke: ' ps' } as const;

describe.each(hockeyGoldenLogs)('golden log: $name', (log) => {
  const run = runHockeyGoldenLog(log);
  const { state } = run.projection;
  const name = (id: string | null) => (id ? (run.handles[id] ?? '?') : '?');

  it('reproduces the result', () => {
    const result = hockeyEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = log.expected.winner === null ? undefined : log.expected.winner === 'A' ? 0 : 1;
    expect(result.winnerSide).toBe(winner);
    expect(result.status).toBe(winner === undefined ? 'drawn' : 'won');
  });

  it.skipIf(!log.expected.goals)('lists the goals', () => {
    const goals = state.goals.map(
      (g) =>
        `${name(g.scorerId)} ${minute(g.minute, g.added)}${KIND[g.kind]}${g.assistId ? ` (${name(g.assistId)})` : ''}`,
    );
    expect(goals).toEqual(log.expected.goals);
  });

  it.skipIf(!log.expected.cards)('lists the cards', () => {
    expect(
      state.cards.map((c) => `${name(c.playerId)} ${c.color} ${minute(c.minute, c.added)}`),
    ).toEqual(log.expected.cards);
  });

  it.skipIf(!log.expected.penaltyCorners)('counts penalty corners', () => {
    expect(state.penaltyCorners).toEqual(log.expected.penaltyCorners);
  });

  it.skipIf(!log.expected.players)('reproduces player statistics', () => {
    const stats = hockeyEngine.stats(state);
    for (const [handle, metrics] of Object.entries(log.expected.players ?? {})) {
      for (const [metric, value] of Object.entries(metrics)) {
        const row = stats.find((s) => s.participantId === run.ids[handle] && s.metric === metric);
        expect([handle, metric, row?.value ?? 0]).toEqual([handle, metric, value]);
      }
    }
  });

  it('replays to the same state', () => {
    const replayed = replay(hockeyEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
