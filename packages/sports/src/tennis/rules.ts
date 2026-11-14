import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { TennisState } from './engine.js';

/** What custom tennis rules can use (D16b). A rule's point counts as a point won. */
export const tennisRuleCatalogue: RuleCatalogue = {
  triggers: [
    { fact: 'point', label: 'A point is won', fields: [sideField('side', 'Won by')] },
    { fact: 'game_won', label: 'A game is won', fields: [sideField('side', 'Won by')] },
    { fact: 'break', label: 'Serve is broken', fields: [sideField('side', 'Broken by')] },
    {
      fact: 'set_won',
      label: 'A set is won',
      fields: [sideField('side', 'Won by'), countField('set', 'Set number', 5)],
    },
  ],
  variables: [
    countField('points_side1', 'Points this game (first side)', 50),
    countField('points_side2', 'Points this game (second side)', 50),
    countField('games_side1', 'Games this set (first side)', 50),
    countField('games_side2', 'Games this set (second side)', 50),
    countField('sets_side1', 'Sets won (first side)', 5),
    countField('sets_side2', 'Sets won (second side)', 5),
    countField('set_number', 'Set number', 5),
    { key: 'tiebreak', label: 'In a tie-break', type: 'boolean' },
  ],
  commands: [{ type: 'point', label: 'Give a point', params: [sideField('winner', 'To')] }],
};

export function tennisRuleVariables(state: TennisState): Record<string, number | boolean> {
  const set = state.sets.at(-1);
  const won: [number, number] = [0, 0];
  for (const s of state.sets) if (s.winner !== null) won[s.winner]++;
  return {
    points_side1: state.game.points[0],
    points_side2: state.game.points[1],
    games_side1: set?.games[0] ?? 0,
    games_side2: set?.games[1] ?? 0,
    sets_side1: won[0],
    sets_side2: won[1],
    set_number: state.sets.length,
    tiebreak: state.game.kind === 'tiebreak',
  };
}
