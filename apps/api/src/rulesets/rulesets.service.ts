import { Inject, Injectable } from '@nestjs/common';
import type {
  CreatedPayload,
  Ruleset,
  RulesetVersion,
  SaveRulesetRequest,
  SaveRulesetVersionRequest,
  SportKey,
} from '@scoresphere/contracts';
import { validateRules } from '@scoresphere/engine-kit';
import { latestEngine } from '@scoresphere/sports';
import { and, desc, eq, isNull, type SQL } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import { rulesets, rulesetVersions } from '../database/schema';
import { type DbExecutor, isUniqueViolation } from '../database/types';
import type { WorkspaceContext } from '../workspaces/workspace-access';

type RulesetRow = typeof rulesets.$inferSelect;
type VersionRow = typeof rulesetVersions.$inferSelect;

const NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'Ruleset not found.');
const NAME_TAKEN = () =>
  new ApiError(409, 'CONFLICT', 'A ruleset with this name already exists.', [
    { field: 'name', code: 'RULESET_NAME_TAKEN' },
  ]);
const invalid = (details: { field: string; code: string }[], message: string) =>
  new ApiError(400, 'VALIDATION_ERROR', message, details);

/** JSON with sorted keys, so equal values compare equal whatever their key order. */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical((value as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function toVersion(row: VersionRow): RulesetVersion {
  return {
    id: row.id,
    rulesetId: row.rulesetId,
    version: row.version,
    engineVersion: row.engineVersion,
    basePresetKey: row.basePresetKey,
    config: row.config as Record<string, unknown>,
    rules: row.rules as RulesetVersion['rules'],
    createdAt: row.createdAt.toISOString(),
  };
}

function toRuleset(row: RulesetRow, latest: VersionRow): Ruleset {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    sport: row.sport as SportKey,
    name: row.name,
    latest: toVersion(latest),
    archivedAt: row.archivedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Rulesets with their latest version, for lists and the offline reference sync. */
export async function selectRulesets(db: DbExecutor, where: SQL | undefined): Promise<Ruleset[]> {
  const rows = await db
    .select({ ruleset: rulesets, version: rulesetVersions })
    .from(rulesets)
    .innerJoin(
      rulesetVersions,
      and(
        eq(rulesetVersions.rulesetId, rulesets.id),
        eq(rulesetVersions.version, rulesets.latestVersion),
      ),
    )
    .where(where)
    .orderBy(rulesets.name);
  return rows.map((r) => toRuleset(r.ruleset, r.version));
}

/**
 * Custom rulesets (plan M8, ADR 0032). Every save is checked against the sport's rule
 * catalogue and stored as a new immutable version; matches copy the version they use.
 */
@Injectable()
export class RulesetsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Checks settings and rules against the sport's current engine. */
  private check(sport: SportKey, body: SaveRulesetVersionRequest) {
    const engine = latestEngine(sport);
    if (!engine?.ruleCatalogue) {
      throw invalid(
        [{ field: 'sport', code: 'NOT_SUPPORTED' }],
        'Custom rules are not available for this sport yet.',
      );
    }
    const config = engine.settingsSchema.safeParse(body.config);
    if (!config.success) {
      throw invalid([{ field: 'config', code: 'INVALID' }], 'The match settings are invalid.');
    }
    const problems = validateRules(engine.ruleCatalogue, body.rules);
    if (problems.length) {
      const index = (ruleId: string) => body.rules.findIndex((r) => r.id === ruleId);
      throw invalid(
        problems.map((p) => ({ field: `rules.${index(p.ruleId)}.${p.path}`, code: p.code })),
        problems[0]!.message,
      );
    }
    return { engineVersion: engine.version, config: config.data as Record<string, unknown> };
  }

  async list(ctx: WorkspaceContext): Promise<Ruleset[]> {
    return selectRulesets(
      this.db,
      and(eq(rulesets.workspaceId, ctx.workspaceId), isNull(rulesets.archivedAt)),
    );
  }

  async create(ctx: WorkspaceContext, body: SaveRulesetRequest): Promise<Ruleset> {
    const { engineVersion, config } = this.check(body.sport, body);
    const id = await this.db.transaction(async (tx) => {
      let row: RulesetRow;
      try {
        [row] = (await tx
          .insert(rulesets)
          .values({
            workspaceId: ctx.workspaceId,
            sport: body.sport,
            name: body.name,
            createdByUserId: ctx.userId,
          })
          .returning()) as [RulesetRow];
      } catch (error) {
        if (isUniqueViolation(error, 'rulesets_workspace_name_unique')) throw NAME_TAKEN();
        throw error;
      }
      await tx.insert(rulesetVersions).values({
        rulesetId: row.id,
        version: 1,
        engineVersion,
        basePresetKey: body.basePresetKey,
        config,
        rules: body.rules,
        createdByUserId: ctx.userId,
      });
      return row.id;
    });
    await this.audit.record({
      action: 'ruleset.created',
      entityType: 'ruleset',
      entityId: id,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
    });
    return this.get(ctx, id);
  }

  /** Saves a new version; earlier versions, and matches using them, never change. */
  async saveVersion(
    ctx: WorkspaceContext,
    id: string,
    body: SaveRulesetVersionRequest,
  ): Promise<Ruleset> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.select().from(rulesets).where(this.owned(ctx, id)).for('update');
      if (!row) throw NOT_FOUND();
      const { engineVersion, config } = this.check(row.sport as SportKey, body);
      const version = row.latestVersion + 1;
      await tx.insert(rulesetVersions).values({
        rulesetId: id,
        version,
        engineVersion,
        basePresetKey: body.basePresetKey,
        config,
        rules: body.rules,
        createdByUserId: ctx.userId,
      });
      try {
        await tx
          .update(rulesets)
          .set({ name: body.name, latestVersion: version })
          .where(eq(rulesets.id, id));
      } catch (error) {
        if (isUniqueViolation(error, 'rulesets_workspace_name_unique')) throw NAME_TAKEN();
        throw error;
      }
    });
    return this.get(ctx, id);
  }

  async versions(ctx: WorkspaceContext, id: string): Promise<RulesetVersion[]> {
    const [row] = await this.db
      .select({ id: rulesets.id })
      .from(rulesets)
      .where(this.owned(ctx, id));
    if (!row) throw NOT_FOUND();
    const rows = await this.db
      .select()
      .from(rulesetVersions)
      .where(eq(rulesetVersions.rulesetId, id))
      .orderBy(desc(rulesetVersions.version));
    return rows.map(toVersion);
  }

  async archive(ctx: WorkspaceContext, id: string): Promise<void> {
    const [row] = await this.db
      .update(rulesets)
      .set({ archivedAt: new Date() })
      .where(this.owned(ctx, id))
      .returning({ id: rulesets.id });
    if (!row) throw NOT_FOUND();
    await this.audit.record({
      action: 'ruleset.archived',
      entityType: 'ruleset',
      entityId: id,
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.userId,
    });
  }

  private async get(ctx: WorkspaceContext, id: string): Promise<Ruleset> {
    const [ruleset] = await selectRulesets(
      this.db,
      and(eq(rulesets.id, id), eq(rulesets.workspaceId, ctx.workspaceId)),
    );
    if (!ruleset) throw NOT_FOUND();
    return ruleset;
  }

  private owned(ctx: WorkspaceContext, id: string) {
    return and(
      eq(rulesets.id, id),
      eq(rulesets.workspaceId, ctx.workspaceId),
      isNull(rulesets.archivedAt),
    );
  }
}

/**
 * The ruleset version a new match came from, when it really is one of this workspace's
 * versions with exactly the match's sport, settings and rules; otherwise null. The rules in
 * the CREATED event are what count either way (ADR 0032); this only records provenance.
 */
export async function matchRulesetVersion(
  db: DbExecutor,
  workspaceId: string,
  created: Pick<CreatedPayload, 'sport' | 'rulesetVersionId' | 'rules'> & { config: unknown },
): Promise<string | null> {
  if (!created.rulesetVersionId) return null;
  const [row] = await db
    .select({ version: rulesetVersions, ruleset: rulesets })
    .from(rulesetVersions)
    .innerJoin(rulesets, eq(rulesets.id, rulesetVersions.rulesetId))
    .where(
      and(eq(rulesetVersions.id, created.rulesetVersionId), eq(rulesets.workspaceId, workspaceId)),
    );
  if (!row || row.ruleset.sport !== created.sport) return null;
  const same =
    canonical(row.version.rules) === canonical(created.rules ?? []) &&
    canonical(row.version.config) === canonical(created.config);
  return same ? row.version.id : null;
}
