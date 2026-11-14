import {
  type Ruleset,
  rulesetSchema,
  type RulesetVersion,
  rulesetVersionSchema,
  type SaveRulesetRequest,
  type SaveRulesetVersionRequest,
} from '@scoresphere/contracts';
import { z } from 'zod';
import { syncReference } from '@/features/sync/reference-sync';
import { apiFetch, json } from '@/lib/api';
import { db } from '@/lib/db';

export const rulesetKeys = {
  versions: (workspaceId: string, id: string) => ['rulesets', workspaceId, id, 'versions'] as const,
};

/** Keeps the device copy in step at once, so the wizard sees a saved ruleset offline too. */
async function remember(ruleset: Ruleset): Promise<Ruleset> {
  await db.rulesets.put(ruleset);
  void syncReference().catch(() => undefined);
  return ruleset;
}

export const createRuleset = (workspaceId: string, body: SaveRulesetRequest): Promise<Ruleset> =>
  apiFetch(
    `/workspaces/${workspaceId}/rulesets`,
    { method: 'POST', ...json(body) },
    rulesetSchema,
  ).then(remember);

export const saveRulesetVersion = (
  workspaceId: string,
  id: string,
  body: SaveRulesetVersionRequest,
): Promise<Ruleset> =>
  apiFetch(
    `/workspaces/${workspaceId}/rulesets/${id}/versions`,
    { method: 'POST', ...json(body) },
    rulesetSchema,
  ).then(remember);

export const listRulesetVersions = (workspaceId: string, id: string): Promise<RulesetVersion[]> =>
  apiFetch(`/workspaces/${workspaceId}/rulesets/${id}/versions`, {}, z.array(rulesetVersionSchema));

export async function archiveRuleset(workspaceId: string, id: string): Promise<void> {
  await apiFetch(`/workspaces/${workspaceId}/rulesets/${id}`, { method: 'DELETE' });
  await db.rulesets.delete(id);
}
