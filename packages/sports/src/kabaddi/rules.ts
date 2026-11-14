import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { KabaddiState } from './engine.js';

/** What custom kabaddi rules can use (D16b): technical points, or the final whistle. */
export const kabaddiRuleCatalogue: RuleCatalogue = {
  triggers: [
    {
      fact: 'raid',
      label: 'A raid ends',
      fields: [
        sideField('side', 'Raiding team'),
        countField('points', 'Points to the raiding team', 20),
        { key: 'tackled', label: 'Raider out', type: 'boolean' },
        { key: 'doOrDie', label: 'Do-or-die raid', type: 'boolean' },
        { key: 'superRaid', label: 'Super raid (3 or more)', type: 'boolean' },
      ],
    },
    {
      fact: 'tackle',
      label: 'The raider is out',
      fields: [
        sideField('side', 'Defending team'),
        { key: 'super', label: 'Super tackle', type: 'boolean' },
      ],
    },
    { fact: 'all_out', label: 'A team is all out', fields: [sideField('side', 'Scored by')] },
    { fact: 'period_ended', label: 'A half ends', fields: [countField('period', 'Half', 2)] },
  ],
  variables: [
    countField('points_side1', 'Points (first side)', 200),
    countField('points_side2', 'Points (second side)', 200),
    countField('lead', 'Lead (points)', 200),
    countField('on_mat_side1', 'Players on the mat (first side)', 7),
    countField('on_mat_side2', 'Players on the mat (second side)', 7),
    countField('half', 'Half', 2),
  ],
  commands: [
    {
      type: 'technical',
      label: 'Give technical points',
      params: [
        sideField('side', 'To'),
        { key: 'points', label: 'Points', type: 'number', min: 1, max: 3 },
      ],
    },
    { type: 'final_whistle', label: 'End the match now', params: [] },
  ],
};

export function kabaddiRuleVariables(state: KabaddiState): Record<string, number> {
  return {
    points_side1: state.score[0],
    points_side2: state.score[1],
    lead: Math.abs(state.score[0] - state.score[1]),
    on_mat_side1: state.onMat[0],
    on_mat_side2: state.onMat[1],
    half: state.periods.number,
  };
}
