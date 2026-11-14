import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { CarromState } from './engine.js';

/** What custom carrom rules can use (D16b): bonus points in the current game. */
export const carromRuleCatalogue: RuleCatalogue = {
  triggers: [
    {
      fact: 'board_won',
      label: 'A board is won',
      fields: [
        sideField('side', 'Won by'),
        countField('points', 'Points scored', 20),
        { key: 'queen', label: 'With the queen', type: 'boolean' },
      ],
    },
    { fact: 'foul', label: 'A foul', fields: [sideField('side', 'By')] },
    { fact: 'game_won', label: 'A game is won', fields: [sideField('side', 'Won by')] },
  ],
  variables: [
    countField('points_side1', 'Points this game (first side)', 50),
    countField('points_side2', 'Points this game (second side)', 50),
    countField('boards', 'Boards played this game', 30),
    countField('games_side1', 'Games won (first side)', 3),
    countField('games_side2', 'Games won (second side)', 3),
  ],
  commands: [
    {
      type: 'bonus',
      label: 'Give bonus points',
      params: [
        sideField('side', 'To'),
        { key: 'points', label: 'Points', type: 'number', min: 1, max: 10 },
      ],
    },
  ],
};

export function carromRuleVariables(state: CarromState): Record<string, number> {
  const game = state.games.at(-1)!;
  const won: [number, number] = [0, 0];
  for (const g of state.games) if (g.winner !== null) won[g.winner] += 1;
  return {
    points_side1: game.points[0],
    points_side2: game.points[1],
    boards: game.boards.length,
    games_side1: won[0],
    games_side2: won[1],
  };
}
