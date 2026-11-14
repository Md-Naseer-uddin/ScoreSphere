import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { VolleyballState } from './engine.js';

/**
 * What custom volleyball rules can use (D16b). A rule's point is a rally won by that team,
 * so it also wins the serve and rotates on a side-out, like a penalty point (FIVB 16.2).
 */
export const volleyballRuleCatalogue: RuleCatalogue = {
  triggers: [
    { fact: 'point', label: 'A point is won', fields: [sideField('side', 'Won by')] },
    {
      fact: 'set_won',
      label: 'A set is won',
      fields: [sideField('side', 'Won by'), countField('set', 'Set number', 5)],
    },
    { fact: 'timeout', label: 'A timeout is taken', fields: [sideField('side', 'Taken by')] },
  ],
  variables: [
    countField('points_side1', 'Points this set (first side)', 60),
    countField('points_side2', 'Points this set (second side)', 60),
    countField('sets_side1', 'Sets won (first side)', 5),
    countField('sets_side2', 'Sets won (second side)', 5),
    countField('set_number', 'Set number', 5),
    { key: 'deciding_set', label: 'Deciding set', type: 'boolean' },
  ],
  commands: [
    { type: 'rally', label: 'Give a point (a rally won)', params: [sideField('winner', 'To')] },
  ],
};

export function volleyballRuleVariables(state: VolleyballState): Record<string, number | boolean> {
  const set = state.sets.at(-1);
  const won: [number, number] = [0, 0];
  for (const s of state.sets) if (s.winner !== null) won[s.winner]++;
  const need = state.config.setsToWin - 1;
  return {
    points_side1: set?.points[0] ?? 0,
    points_side2: set?.points[1] ?? 0,
    sets_side1: won[0],
    sets_side2: won[1],
    set_number: state.sets.length,
    deciding_set: won[0] === need && won[1] === need,
  };
}
