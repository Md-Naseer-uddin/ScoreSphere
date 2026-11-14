import { replay } from '@scoresphere/engine-kit';
import { describe, expect, it } from 'vitest';
import { footballEngine } from './engine.js';
import { footballGoldenLogs } from './golden/logs.js';
import { runFootballGoldenLog } from './golden/run.js';

const minute = (m: number, added: number) => (added ? `${m}+${added}'` : `${m}'`);

describe.each(footballGoldenLogs)('golden log: $name', (log) => {
  const run = runFootballGoldenLog(log);
  const { state } = run.projection;
  const name = (id: string | null) => (id ? (run.handles[id] ?? '?') : '?');

  it('reproduces the result', () => {
    const result = footballEngine.result(state);
    expect(result.summary).toBe(log.expected.summary);
    const winner = log.expected.winner === null ? undefined : log.expected.winner === 'A' ? 0 : 1;
    expect(result.winnerSide).toBe(winner);
    expect(result.status).toBe(winner === undefined ? 'drawn' : 'won');
  });

  it.skipIf(!log.expected.goals)('lists the goals', () => {
    const goals = state.goals.map((g) => {
      const kind = g.kind === 'penalty' ? ' pen' : g.kind === 'own_goal' ? ' og' : '';
      const assist = g.assistId ? ` (${name(g.assistId)})` : '';
      return `${name(g.scorerId)} ${minute(g.minute, g.added)}${kind}${assist}`;
    });
    expect(goals).toEqual(log.expected.goals);
  });

  it.skipIf(!log.expected.cards)('lists the cards', () => {
    const cards = state.cards.map(
      (c) =>
        `${name(c.playerId)} ${c.color} ${minute(c.minute, c.added)}${c.secondYellow ? ' (second yellow)' : ''}`,
    );
    expect(cards).toEqual(log.expected.cards);
  });

  it.skipIf(!log.expected.players)('reproduces player statistics', () => {
    const stats = footballEngine.stats(state);
    for (const [handle, metrics] of Object.entries(log.expected.players ?? {})) {
      for (const [metric, value] of Object.entries(metrics)) {
        const row = stats.find((s) => s.participantId === run.ids[handle] && s.metric === metric);
        expect([handle, metric, row?.value ?? 0]).toEqual([handle, metric, value]);
      }
    }
  });

  it('replays to the same state', () => {
    const replayed = replay(footballEngine, run.events);
    expect(replayed.ok && replayed.value.state).toEqual(state);
  });
});
