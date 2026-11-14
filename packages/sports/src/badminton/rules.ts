import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { BadmintonState } from './engine.js';

/** What custom badminton rules can use (D16b). A rule's point is a rally won by that side. */
export const badmintonRuleCatalogue: RuleCatalogue = {
  triggers: [
    { fact: 'point', label: 'A point is won', fields: [sideField('side', 'Won by')] },
    {
      fact: 'game_won',
      label: 'A game is won',
      fields: [sideField('side', 'Won by'), countField('game', 'Game number', 5)],
    },
    { fact: 'interval', label: 'The interval is reached', fields: [] },
  ],
  variables: [
    countField('points_side1', 'Points this game (first side)', 50),
    countField('points_side2', 'Points this game (second side)', 50),
    countField('games_side1', 'Games won (first side)', 5),
    countField('games_side2', 'Games won (second side)', 5),
    countField('game_number', 'Game number', 5),
    countField('streak', 'Points in a row (current run)', 50),
    { key: 'deciding_game', label: 'Deciding game', type: 'boolean' },
  ],
  commands: [
    { type: 'rally', label: 'Give a point (a rally won)', params: [sideField('winner', 'To')] },
  ],
};

export function badmintonRuleVariables(state: BadmintonState): Record<string, number | boolean> {
  const game = state.games.at(-1)!;
  const won: [number, number] = [0, 0];
  for (const g of state.games) if (g.winner !== null) won[g.winner]++;
  const need = state.config.gamesToWin - 1;
  return {
    points_side1: game.points[0],
    points_side2: game.points[1],
    games_side1: won[0],
    games_side2: won[1],
    game_number: state.games.length,
    streak: state.streak.length,
    deciding_game: need > 0 && won[0] === need && won[1] === need,
  };
}
