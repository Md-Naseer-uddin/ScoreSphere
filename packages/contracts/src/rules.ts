import { z } from 'zod';
import { idSchema } from './ids.js';
import { sportKeySchema } from './sports.js';

/**
 * Trigger → condition → action rules (plan D16b). Rules are data, never code: a trigger is a
 * fact the engine emits, conditions compare the fact's fields or the engine's state
 * variables with constants, and actions are commands the engine itself declares.
 */
const ruleValueSchema = z.union([z.number(), z.string().max(60), z.boolean()]);
export type RuleValue = z.infer<typeof ruleValueSchema>;

export const RULE_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in'] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export const ruleConditionSchema = z.object({
  source: z.enum(['fact', 'state']),
  key: z.string().min(1).max(60),
  op: z.enum(RULE_OPERATORS),
  value: z.union([ruleValueSchema, z.array(ruleValueSchema).min(1).max(20)]),
});
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

export const ruleActionSchema = z.object({
  command: z.string().min(1).max(60),
  params: z.record(z.string(), ruleValueSchema),
});
export type RuleAction = z.infer<typeof ruleActionSchema>;

export const ruleSchema = z.object({
  /** Stable within a ruleset; ties in priority are broken by it. */
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1, 'REQUIRED').max(80, 'TOO_LONG'),
  /** Higher runs first. */
  priority: z.int().min(0).max(100),
  trigger: z.string().min(1).max(60),
  conditions: z.array(ruleConditionSchema).max(8),
  actions: z.array(ruleActionSchema).min(1).max(3),
});
export type Rule = z.infer<typeof ruleSchema>;

export const rulesSchema = z.array(ruleSchema).max(30);

/** A saved ruleset; every save is a new immutable version (spec sports §5). */
export const rulesetSchema = z.object({
  id: idSchema,
  workspaceId: idSchema,
  sport: sportKeySchema,
  name: z.string(),
  latestVersion: z.int(),
  updatedAt: z.iso.datetime(),
});
export type Ruleset = z.infer<typeof rulesetSchema>;

export const rulesetVersionSchema = z.object({
  id: idSchema,
  rulesetId: idSchema,
  version: z.int(),
  /** Based on this preset; the settings are stored resolved. */
  basePresetKey: z.string(),
  config: z.record(z.string(), z.unknown()),
  rules: rulesSchema,
  createdAt: z.iso.datetime(),
});
export type RulesetVersion = z.infer<typeof rulesetVersionSchema>;

export const saveRulesetRequestSchema = z.object({
  name: z.string().trim().min(1, 'REQUIRED').max(80, 'TOO_LONG'),
  sport: sportKeySchema,
  basePresetKey: z.string().min(1).max(60),
  config: z.record(z.string(), z.unknown()),
  rules: rulesSchema,
});
export type SaveRulesetRequest = z.infer<typeof saveRulesetRequestSchema>;
