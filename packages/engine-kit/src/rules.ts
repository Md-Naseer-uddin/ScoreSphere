import type { Rule, RuleCondition, RuleValue } from '@scoresphere/contracts';
import type { DomainFact } from './engine.js';

/** A typed field a condition can read (a fact's data or one of the engine's state variables). */
export interface RuleField {
  key: string;
  label: string;
  type: 'number' | 'string' | 'boolean';
  /** Allowed values, when the field is an enumeration. */
  options?: readonly (string | number)[];
  /** How to show each option, in the same order (defaults to the value itself). */
  optionLabels?: readonly string[];
  min?: number;
  max?: number;
}

/**
 * What a sport lets rules use (plan D16b): triggers are facts the engine emits, variables
 * describe the current state, and commands are actions the engine accepts from rules. A
 * builder can offer only these, so rules can never reach into engine internals.
 */
export interface RuleCatalogue {
  triggers: { fact: string; label: string; fields: RuleField[] }[];
  variables: RuleField[];
  commands: { type: string; label: string; params: RuleField[] }[];
}

export interface RuleProblem {
  ruleId: string;
  path: string;
  code:
    | 'DUPLICATE_ID'
    | 'UNKNOWN_TRIGGER'
    | 'UNKNOWN_FIELD'
    | 'BAD_OPERATOR'
    | 'BAD_VALUE'
    | 'UNKNOWN_COMMAND'
    | 'MISSING_PARAM'
    | 'UNKNOWN_PARAM'
    | 'BAD_PARAM';
  message: string;
}

const ORDERED = new Set(['gt', 'gte', 'lt', 'lte']);

function valueFits(field: RuleField, value: RuleValue): boolean {
  if (typeof value !== field.type) return false;
  if (field.options && !field.options.includes(value as string | number)) return false;
  if (typeof value === 'number') {
    if (field.min !== undefined && value < field.min) return false;
    if (field.max !== undefined && value > field.max) return false;
  }
  return true;
}

/** Checks rules against the sport's catalogue; an empty list means they can be saved. */
export function validateRules(catalogue: RuleCatalogue, rules: readonly Rule[]): RuleProblem[] {
  const problems: RuleProblem[] = [];
  const seen = new Set<string>();
  for (const rule of rules) {
    const fail = (path: string, code: RuleProblem['code'], message: string) =>
      problems.push({ ruleId: rule.id, path, code, message });
    if (seen.has(rule.id)) fail('id', 'DUPLICATE_ID', 'Two rules have the same ID.');
    seen.add(rule.id);
    const trigger = catalogue.triggers.find((t) => t.fact === rule.trigger);
    if (!trigger) fail('trigger', 'UNKNOWN_TRIGGER', `This sport has no "${rule.trigger}" event.`);
    rule.conditions.forEach((c, i) => {
      const fields = c.source === 'fact' ? (trigger?.fields ?? []) : catalogue.variables;
      const field = fields.find((f) => f.key === c.key);
      if (!field) return fail(`conditions.${i}.key`, 'UNKNOWN_FIELD', `Unknown value "${c.key}".`);
      if (ORDERED.has(c.op) && field.type !== 'number') {
        return fail(
          `conditions.${i}.op`,
          'BAD_OPERATOR',
          `"${field.label}" can only be compared for equality.`,
        );
      }
      const values = Array.isArray(c.value) ? c.value : [c.value];
      if ((c.op === 'in') !== Array.isArray(c.value)) {
        return fail(
          `conditions.${i}.value`,
          'BAD_VALUE',
          '"is one of" needs a list; other comparisons need one value.',
        );
      }
      if (!values.every((v) => valueFits(field, v))) {
        fail(
          `conditions.${i}.value`,
          'BAD_VALUE',
          `That is not a valid value for "${field.label}".`,
        );
      }
    });
    rule.actions.forEach((a, i) => {
      const command = catalogue.commands.find((c) => c.type === a.command);
      if (!command)
        return fail(
          `actions.${i}.command`,
          'UNKNOWN_COMMAND',
          `Rules can't do "${a.command}" in this sport.`,
        );
      for (const param of command.params) {
        if (!(param.key in a.params))
          fail(`actions.${i}.params.${param.key}`, 'MISSING_PARAM', `Set "${param.label}".`);
        else if (!valueFits(param, a.params[param.key]!)) {
          fail(
            `actions.${i}.params.${param.key}`,
            'BAD_PARAM',
            `That is not a valid value for "${param.label}".`,
          );
        }
      }
      for (const key of Object.keys(a.params)) {
        if (!command.params.some((p) => p.key === key))
          fail(`actions.${i}.params.${key}`, 'UNKNOWN_PARAM', `Unknown setting "${key}".`);
      }
    });
  }
  return problems;
}

function compare(
  op: RuleCondition['op'],
  actual: unknown,
  expected: RuleCondition['value'],
): boolean {
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'in':
      return Array.isArray(expected) && expected.includes(actual as RuleValue);
    default: {
      if (typeof actual !== 'number' || typeof expected !== 'number') return false;
      if (op === 'gt') return actual > expected;
      if (op === 'gte') return actual >= expected;
      if (op === 'lt') return actual < expected;
      return actual <= expected;
    }
  }
}

/** Whether a rule fires for this fact, given the state variables after it. */
export function ruleMatches(
  rule: Rule,
  fact: DomainFact,
  variables: Record<string, unknown>,
): boolean {
  if (rule.trigger !== fact.type) return false;
  return rule.conditions.every((c) =>
    compare(c.op, c.source === 'fact' ? fact.data?.[c.key] : variables[c.key], c.value),
  );
}

/** Rules for a fact in firing order: priority (high first), then ID. */
export function rulesFor(rules: readonly Rule[], factType: string): Rule[] {
  return rules
    .filter((r) => r.trigger === factType)
    .sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

/** Limits that keep rule chains finite (plan M8: depth and cycle limits). */
export const RULE_LIMITS = { maxDepth: 3, maxEffectsPerEvent: 20 } as const;
