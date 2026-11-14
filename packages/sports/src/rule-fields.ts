import type { RuleField } from '@scoresphere/engine-kit';

/** Fields shared by several sports' rule catalogues. */
export const sideField = (key: string, label: string): RuleField => ({
  key,
  label,
  type: 'number',
  options: [0, 1],
  optionLabels: ['First side', 'Second side'],
});

export const countField = (key: string, label: string, max?: number): RuleField => ({
  key,
  label,
  type: 'number',
  min: 0,
  ...(max !== undefined ? { max } : {}),
});
