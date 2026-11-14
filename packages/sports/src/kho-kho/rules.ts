import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { KhoKhoState } from './engine.js';

/** What custom kho-kho rules can use (D16b): technical points, or the final whistle. */
export const khoKhoRuleCatalogue: RuleCatalogue = {
  triggers: [
    {
      fact: 'out',
      label: 'A defender is out',
      fields: [
        sideField('side', 'Chasing team'),
        {
          key: 'kind',
          label: 'How',
          type: 'string',
          options: ['touch', 'pole_dive', 'out_of_field', 'late_entry', 'other'],
          optionLabels: ['Touch', 'Pole dive', 'Out of the field', 'Late entry', 'Other'],
        },
      ],
    },
    {
      fact: 'batch_out',
      label: 'A whole batch is out',
      fields: [sideField('side', 'Defending team'), countField('batch', 'Batch', 20)],
    },
    { fact: 'turn_ended', label: 'A turn ends', fields: [countField('turn', 'Turn', 4)] },
  ],
  variables: [
    countField('points_side1', 'Points (first side)', 200),
    countField('points_side2', 'Points (second side)', 200),
    countField('lead', 'Lead (points)', 200),
    countField('turn', 'Turn', 4),
    countField('outs_this_turn', 'Defenders out this turn', 100),
  ],
  commands: [
    {
      type: 'technical',
      label: 'Give points',
      params: [
        sideField('side', 'To'),
        { key: 'points', label: 'Points', type: 'number', min: 1, max: 3 },
      ],
    },
    { type: 'final_whistle', label: 'End the match now', params: [] },
  ],
};

export function khoKhoRuleVariables(state: KhoKhoState): Record<string, number> {
  return {
    points_side1: state.score[0],
    points_side2: state.score[1],
    lead: Math.abs(state.score[0] - state.score[1]),
    turn: state.periods.number,
    outs_this_turn: state.outs.filter((o) => o.turn === state.periods.number).length,
  };
}
