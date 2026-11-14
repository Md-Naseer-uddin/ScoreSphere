import { Inject, Injectable } from '@nestjs/common';
import type {
  AddTournamentEntriesRequest,
  CreateTournamentRequest,
  Leaderboard,
  MatchHeader,
  MatchResult,
  SportKey,
  StandingsRowDto,
  Tournament,
  TournamentAward,
  TournamentDetail,
  TournamentFixture,
} from '@scoresphere/contracts';
import {
  aggregatePlayerStats,
  computeStandings,
  type FixtureResult,
  getEngine,
  latestEngine,
  type PlannedFixture,
  playerAwardWinners,
  roundRobin,
  singleElimination,
  tournamentRules,
} from '@scoresphere/sports';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { AuditService } from '../audit/audit.service';
import type { AuthUser } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import {
  awardRecords,
  matches,
  matchSideParticipants,
  rosterMembers,
  teams,
  tournamentEntries,
  tournamentFixtures,
  tournaments,
} from '../database/schema';
import type { DbExecutor, Transaction } from '../database/types';
import { requireWorkspaceRole, type WorkspaceContext } from '../workspaces/workspace-access';

type TournamentRow = typeof tournaments.$inferSelect;
type FixtureRow = typeof tournamentFixtures.$inferSelect;
type EntryRow = typeof tournamentEntries.$inferSelect;
type MatchRow = typeof matches.$inferSelect;

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Tournament not found.');
const invalid = (field: string, code: string, message: string) =>
  new ApiError(400, 'VALIDATION_ERROR', message, [{ field, code }]);
const conflict = (code: string, message: string) =>
  new ApiError(409, 'CONFLICT', message, [{ field: 'tournament', code }]);

/** JSON with sorted keys, so equal settings compare equal whatever their key order. */
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

function toTournament(row: TournamentRow): Tournament {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    sport: row.sport as SportKey,
    format: row.format as Tournament['format'],
    engineVersion: row.engineVersion,
    presetKey: row.presetKey,
    presetVersion: row.presetVersion,
    config: row.config as Record<string, unknown>,
    points: row.points as Tournament['points'],
    tieBreaks: row.tieBreaks as string[],
    status: row.status as Tournament['status'],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function fixtureStatus(f: FixtureRow, match: MatchRow | undefined): TournamentFixture['status'] {
  if (f.bye) return 'bye';
  if (match?.status === 'completed' || f.winnerEntryId) return 'completed';
  if (f.matchId) return 'live';
  return f.side1EntryId && f.side2EntryId ? 'ready' : 'waiting';
}

/**
 * Tournaments (plan M7). Fixtures become normal matches: a scorer creates the match on their
 * device naming the fixture, and the result flows back here as the match changes.
 */
@Injectable()
export class TournamentsService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async create(ctx: WorkspaceContext, body: CreateTournamentRequest): Promise<Tournament> {
    const engine = latestEngine(body.sport);
    const rules = tournamentRules(body.sport);
    if (!engine || !rules)
      throw invalid('sport', 'NOT_SUPPORTED', 'Tournaments are not available for this sport yet.');
    const config = engine.settingsSchema.safeParse(body.config);
    if (!config.success) throw invalid('config', 'INVALID', 'The match settings are invalid.');
    const tieBreaks = body.tieBreaks ?? rules.tieBreaks;
    if (!tieBreaks.every((t) => rules.allowedTieBreaks.includes(t))) {
      throw invalid(
        'tieBreaks',
        'NOT_ALLOWED',
        'One of the tie-breaks does not apply to this sport.',
      );
    }
    const [row] = await this.db
      .insert(tournaments)
      .values({
        workspaceId: ctx.workspaceId,
        name: body.name,
        sport: body.sport,
        format: body.format,
        engineVersion: engine.version,
        presetKey: body.presetKey,
        presetVersion: body.presetVersion,
        config: config.data,
        points: body.points ?? rules.points,
        tieBreaks,
        createdByUserId: ctx.userId,
      })
      .returning();
    return toTournament(row!);
  }

  async list(ctx: WorkspaceContext): Promise<Tournament[]> {
    const rows = await this.db
      .select()
      .from(tournaments)
      .where(eq(tournaments.workspaceId, ctx.workspaceId))
      .orderBy(asc(tournaments.createdAt));
    return rows.map(toTournament).reverse();
  }

  async detail(user: AuthUser, id: string): Promise<TournamentDetail> {
    const t = await this.access(this.db, user, id, 'VIEWER');
    return this.detailOf(this.db, t);
  }

  async addEntries(
    user: AuthUser,
    id: string,
    body: AddTournamentEntriesRequest,
  ): Promise<TournamentDetail> {
    return this.db.transaction(async (tx) => {
      const t = await this.access(tx, user, id, 'SCORER', true);
      if (t.status !== 'draft')
        throw conflict('NOT_DRAFT', 'Entries can be changed only before fixtures are made.');
      const existing = await tx
        .select()
        .from(tournamentEntries)
        .where(eq(tournamentEntries.tournamentId, id));
      const teamIds = body.entries.flatMap((e) => (e.teamId ? [e.teamId] : []));
      const memberIds = body.entries.flatMap((e) => (e.rosterMemberId ? [e.rosterMemberId] : []));
      const teamRows = teamIds.length
        ? await tx
            .select()
            .from(teams)
            .where(and(inArray(teams.id, teamIds), eq(teams.workspaceId, t.workspaceId)))
        : [];
      const memberRows = memberIds.length
        ? await tx
            .select()
            .from(rosterMembers)
            .where(
              and(
                inArray(rosterMembers.id, memberIds),
                eq(rosterMembers.workspaceId, t.workspaceId),
              ),
            )
        : [];
      let seed = existing.length;
      const values = body.entries.map((e) => {
        const name = e.teamId
          ? teamRows.find((r) => r.id === e.teamId && !r.archivedAt)?.name
          : memberRows.find((r) => r.id === e.rosterMemberId && r.status === 'ACTIVE')?.displayName;
        if (!name)
          throw invalid(
            'entries',
            'NOT_IN_WORKSPACE',
            'Every entry must be a team or player in this workspace.',
          );
        const duplicate = existing.some(
          (x) =>
            (e.teamId && x.teamId === e.teamId) ||
            (e.rosterMemberId && x.rosterMemberId === e.rosterMemberId),
        );
        if (duplicate) throw invalid('entries', 'ALREADY_ENTERED', `${name} is already entered.`);
        return {
          tournamentId: id,
          teamId: e.teamId ?? null,
          rosterMemberId: e.rosterMemberId ?? null,
          displayName: name,
          seed: ++seed,
        };
      });
      await tx.insert(tournamentEntries).values(values);
      await tx.update(tournaments).set({ updatedAt: new Date() }).where(eq(tournaments.id, id));
      return this.detailOf(tx, t);
    });
  }

  async removeEntry(user: AuthUser, id: string, entryId: string): Promise<TournamentDetail> {
    return this.db.transaction(async (tx) => {
      const t = await this.access(tx, user, id, 'SCORER', true);
      if (t.status !== 'draft')
        throw conflict('NOT_DRAFT', 'Entries can be changed only before fixtures are made.');
      await tx
        .delete(tournamentEntries)
        .where(and(eq(tournamentEntries.id, entryId), eq(tournamentEntries.tournamentId, id)));
      // Keep seeds contiguous in their current order.
      const rest = await tx
        .select()
        .from(tournamentEntries)
        .where(eq(tournamentEntries.tournamentId, id))
        .orderBy(asc(tournamentEntries.seed));
      for (const [i, e] of rest.entries()) {
        if (e.seed !== i + 1)
          await tx
            .update(tournamentEntries)
            .set({ seed: i + 1 })
            .where(eq(tournamentEntries.id, e.id));
      }
      return this.detailOf(tx, t);
    });
  }

  /** Makes the fixtures from the entries in seed order; the tournament becomes active. */
  async generate(user: AuthUser, id: string): Promise<TournamentDetail> {
    return this.db.transaction(async (tx) => {
      const t = await this.access(tx, user, id, 'SCORER', true);
      if (t.status !== 'draft') throw conflict('NOT_DRAFT', 'Fixtures have already been made.');
      const entries = await tx
        .select()
        .from(tournamentEntries)
        .where(eq(tournamentEntries.tournamentId, id))
        .orderBy(asc(tournamentEntries.seed));
      if (entries.length < 2) throw conflict('TOO_FEW_ENTRIES', 'Add at least two entries first.');
      const ids = entries.map((e) => e.id);
      const planned: PlannedFixture[] =
        t.format === 'round_robin' ? roundRobin(ids) : singleElimination(ids);
      await tx.insert(tournamentFixtures).values(
        planned.map((f) => ({
          tournamentId: id,
          round: f.round,
          position: f.position,
          side1EntryId: f.side1,
          side2EntryId: f.side2,
          bye: f.bye,
          winnerEntryId: f.bye ? f.side1 : null,
          nextRound: f.next?.round ?? null,
          nextPosition: f.next?.position ?? null,
          nextSlot: f.next?.slot ?? null,
        })),
      );
      await tx.update(tournaments).set({ status: 'active' }).where(eq(tournaments.id, id));
      await this.audit.record(
        {
          action: 'tournament.fixtures_generated',
          entityType: 'tournament',
          entityId: id,
          actorUserId: user.id,
          workspaceId: t.workspaceId,
          metadata: { fixtures: planned.length },
        },
        tx,
      );
      return this.detailOf(tx, { ...t, status: 'active' });
    });
  }

  /**
   * Called when a match is created for a fixture (ADR 0008): checks it really is that
   * fixture's match, then links them.
   */
  async linkFixture(
    tx: Transaction,
    header: MatchHeader,
    match: { id: string; sport: string; engineVersion: number; presetKey: string; config: unknown },
  ): Promise<void> {
    if (!header.fixtureId) return;
    const [fixture] = await tx
      .select()
      .from(tournamentFixtures)
      .where(eq(tournamentFixtures.id, header.fixtureId))
      .for('update');
    const [t] = fixture
      ? await tx.select().from(tournaments).where(eq(tournaments.id, fixture.tournamentId))
      : [];
    if (!fixture || !t || t.workspaceId !== header.workspaceId) {
      throw invalid('match.fixtureId', 'UNKNOWN_FIXTURE', 'That fixture is not in this workspace.');
    }
    if (fixture.bye || !fixture.side1EntryId || !fixture.side2EntryId) {
      throw invalid(
        'match.fixtureId',
        'FIXTURE_NOT_READY',
        'Both sides of this fixture are not known yet.',
      );
    }
    if (fixture.matchId)
      throw new ApiError(409, 'CONFLICT', 'This fixture already has a match.', [
        { field: 'match.fixtureId', code: 'FIXTURE_TAKEN' },
      ]);
    if (
      t.sport !== match.sport ||
      t.engineVersion !== match.engineVersion ||
      t.presetKey !== match.presetKey ||
      canonical(t.config) !== canonical(match.config)
    ) {
      throw invalid(
        'match.fixtureId',
        'SETTINGS_MISMATCH',
        "The match must use the tournament's settings.",
      );
    }
    const entries = await tx
      .select()
      .from(tournamentEntries)
      .where(inArray(tournamentEntries.id, [fixture.side1EntryId, fixture.side2EntryId]));
    const sideMatches = (entryId: string, side: MatchHeader['sides'][number]) => {
      const entry = entries.find((e) => e.id === entryId)!;
      return entry.teamId
        ? side.teamId === entry.teamId
        : side.participants.some((p) => p.rosterMemberId === entry.rosterMemberId);
    };
    if (
      !sideMatches(fixture.side1EntryId, header.sides[0]!) ||
      !sideMatches(fixture.side2EntryId, header.sides[1]!)
    ) {
      throw invalid(
        'match.fixtureId',
        'SIDES_MISMATCH',
        "The match's sides must be the fixture's entries, first entry first.",
      );
    }
    await tx
      .update(tournamentFixtures)
      .set({ matchId: match.id })
      .where(eq(tournamentFixtures.id, fixture.id));
  }

  /** Keeps a fixture, the bracket and tournament awards in step with its match. */
  async onMatchChanged(
    tx: Transaction,
    match: { id: string; status: string; result: MatchResult | null },
  ): Promise<void> {
    const [fixture] = await tx
      .select()
      .from(tournamentFixtures)
      .where(eq(tournamentFixtures.matchId, match.id))
      .for('update');
    if (!fixture) return;
    const [t] = await tx
      .select()
      .from(tournaments)
      .where(eq(tournaments.id, fixture.tournamentId))
      .for('update');
    if (!t) return;
    const completed = match.status === 'completed';
    const winnerSide = completed ? match.result?.winnerSide : undefined;
    const winner =
      winnerSide === 0 ? fixture.side1EntryId : winnerSide === 1 ? fixture.side2EntryId : null;
    const knockout = t.format === 'single_elimination';
    // A level knockout match (e.g. a tie with no super over) needs an organizer's decision;
    // one already made stands while the match stays level.
    const level = knockout && completed && winner === null;
    const kept = level && fixture.decidedByUserId ? fixture.winnerEntryId : null;
    const nextWinner = kept ?? winner;
    await tx
      .update(tournamentFixtures)
      .set({
        winnerEntryId: nextWinner,
        needsDecision: level && !kept,
        decidedByUserId: kept ? fixture.decidedByUserId : null,
      })
      .where(eq(tournamentFixtures.id, fixture.id));
    if (knockout) await this.advance(tx, fixture, nextWinner);
    await this.afterResultChange(tx, t);
  }

  /** An organizer decides who advances from a knockout fixture that ended level. */
  async decide(
    user: AuthUser,
    id: string,
    fixtureId: string,
    winnerEntryId: string,
  ): Promise<TournamentDetail> {
    return this.db.transaction(async (tx) => {
      const t = await this.access(tx, user, id, 'ADMIN', true);
      const [fixture] = await tx
        .select()
        .from(tournamentFixtures)
        .where(and(eq(tournamentFixtures.id, fixtureId), eq(tournamentFixtures.tournamentId, id)))
        .for('update');
      if (!fixture) throw new ApiError(404, 'NOT_FOUND', 'Fixture not found.');
      if (!fixture.needsDecision)
        throw conflict('NO_DECISION_NEEDED', 'This fixture already has a winner.');
      if (winnerEntryId !== fixture.side1EntryId && winnerEntryId !== fixture.side2EntryId) {
        throw invalid('winnerEntryId', 'NOT_IN_FIXTURE', 'Choose one of the two sides.');
      }
      await tx
        .update(tournamentFixtures)
        .set({ winnerEntryId, needsDecision: false, decidedByUserId: user.id })
        .where(eq(tournamentFixtures.id, fixtureId));
      await this.advance(tx, fixture, winnerEntryId);
      await this.audit.record(
        {
          action: 'tournament.fixture_decided',
          entityType: 'tournament',
          entityId: id,
          actorUserId: user.id,
          workspaceId: t.workspaceId,
          metadata: { fixtureId, winnerEntryId },
        },
        tx,
      );
      await this.afterResultChange(tx, t);
      return this.detailOf(tx, t);
    });
  }

  /** Moves a knockout winner into the next round, unless that match has already started. */
  private async advance(
    tx: Transaction,
    fixture: FixtureRow,
    winner: string | null,
  ): Promise<void> {
    if (!fixture.nextRound || !fixture.nextPosition || !fixture.nextSlot) return;
    const [next] = await tx
      .select()
      .from(tournamentFixtures)
      .where(
        and(
          eq(tournamentFixtures.tournamentId, fixture.tournamentId),
          eq(tournamentFixtures.round, fixture.nextRound),
          eq(tournamentFixtures.position, fixture.nextPosition),
        ),
      )
      .for('update');
    if (!next || next.matchId) return;
    await tx
      .update(tournamentFixtures)
      .set(fixture.nextSlot === 1 ? { side1EntryId: winner } : { side2EntryId: winner })
      .where(eq(tournamentFixtures.id, next.id));
  }

  /** Completes the tournament and publishes its awards, or marks published awards stale. */
  private async afterResultChange(tx: Transaction, t: TournamentRow): Promise<void> {
    const fixtures = await tx
      .select()
      .from(tournamentFixtures)
      .where(eq(tournamentFixtures.tournamentId, t.id));
    const matchRows = await this.matchesOf(tx, fixtures);
    const done = fixtures.every(
      (f) => f.bye || (matchRows.get(f.matchId ?? '')?.status === 'completed' && !f.needsDecision),
    );
    const status = done ? 'completed' : 'active';
    if (status !== t.status)
      await tx.update(tournaments).set({ status }).where(eq(tournaments.id, t.id));
    const published = await tx
      .select()
      .from(awardRecords)
      .where(and(eq(awardRecords.tournamentId, t.id), eq(awardRecords.status, 'PUBLISHED')));
    if (published.length) {
      // ADR 0023: a correction after publishing sends the awards back for review.
      await tx
        .update(awardRecords)
        .set({ status: 'STALE' })
        .where(
          inArray(
            awardRecords.id,
            published.map((p) => p.id),
          ),
        );
    } else if (done) {
      await this.publishAwards(tx, { ...t, status });
    }
  }

  async standings(user: AuthUser, id: string): Promise<StandingsRowDto[]> {
    const t = await this.access(this.db, user, id, 'VIEWER');
    return this.standingsOf(this.db, t);
  }

  private async standingsOf(db: DbExecutor, t: TournamentRow): Promise<StandingsRowDto[]> {
    const rules = tournamentRules(t.sport as SportKey)!;
    const [entries, fixtures] = await Promise.all([
      db
        .select()
        .from(tournamentEntries)
        .where(eq(tournamentEntries.tournamentId, t.id))
        .orderBy(asc(tournamentEntries.seed)),
      db.select().from(tournamentFixtures).where(eq(tournamentFixtures.tournamentId, t.id)),
    ]);
    const matchRows = await this.matchesOf(db, fixtures);
    const results: FixtureResult[] = [];
    for (const f of fixtures) {
      const m = matchRows.get(f.matchId ?? '');
      if (!m || m.status !== 'completed' || !f.side1EntryId || !f.side2EntryId || !m.currentState)
        continue;
      const result = m.result as MatchResult | null;
      const winner =
        result?.winnerSide === 0
          ? f.side1EntryId
          : result?.winnerSide === 1
            ? f.side2EntryId
            : (f.winnerEntryId ?? null);
      results.push({
        side1: f.side1EntryId,
        side2: f.side2EntryId,
        winner,
        totals: [rules.totals(m.currentState, 0), rules.totals(m.currentState, 1)],
      });
    }
    const table = computeStandings(
      entries.map((e) => e.id),
      results,
      t.points as never,
      t.tieBreaks as string[],
    );
    const names = new Map(entries.map((e) => [e.id, e.displayName]));
    return table.map((r) => ({
      entryId: r.entryId,
      displayName: names.get(r.entryId) ?? '?',
      rank: r.rank,
      played: r.played,
      won: r.won,
      drawn: r.drawn,
      lost: r.lost,
      points: r.points,
      tieBreaks: r.tieBreaks,
    }));
  }

  async leaderboards(user: AuthUser, id: string): Promise<Leaderboard[]> {
    const t = await this.access(this.db, user, id, 'VIEWER');
    const rules = tournamentRules(t.sport as SportKey)!;
    if (rules.leaderboards.length === 0) return [];
    const { totals, names } = await this.playerTotals(this.db, t);
    return rules.leaderboards.map((board) => ({
      metric: board.metric,
      label: board.label,
      rows: [...totals.entries()]
        .map(([rosterMemberId, s]) => ({
          rosterMemberId,
          displayName: names.get(rosterMemberId) ?? '?',
          value: s[board.metric] ?? 0,
        }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value || a.displayName.localeCompare(b.displayName))
        .slice(0, 5),
    }));
  }

  private async playerTotals(db: DbExecutor, t: TournamentRow) {
    const rules = tournamentRules(t.sport as SportKey)!;
    const engine = getEngine(t.sport as SportKey, t.engineVersion)!;
    const fixtures = await db
      .select()
      .from(tournamentFixtures)
      .where(eq(tournamentFixtures.tournamentId, t.id));
    const matchRows = [...(await this.matchesOf(db, fixtures)).values()].filter(
      (m) => m.status === 'completed' && m.currentState,
    );
    const participants = matchRows.length
      ? await db
          .select()
          .from(matchSideParticipants)
          .where(
            inArray(
              matchSideParticipants.matchId,
              matchRows.map((m) => m.id),
            ),
          )
      : [];
    const rosterOf = new Map(participants.map((p) => [p.id, p.rosterMemberId]));
    const totals = aggregatePlayerStats(
      matchRows.map((m) => ({
        stats: engine.stats(m.currentState),
        rosterOf: (pid: string) => rosterOf.get(pid) ?? null,
      })),
      rules.derive,
    );
    const memberIds = [...totals.keys()];
    const members = memberIds.length
      ? await db.select().from(rosterMembers).where(inArray(rosterMembers.id, memberIds))
      : [];
    return { totals, names: new Map(members.map((m) => [m.id, m.displayName])) };
  }

  async awards(user: AuthUser, id: string): Promise<TournamentAward[]> {
    const t = await this.access(this.db, user, id, 'VIEWER');
    return this.awardsOf(this.db, t);
  }

  /** An organizer reviews stale awards and publishes them again from the current results. */
  async republish(user: AuthUser, id: string): Promise<TournamentAward[]> {
    return this.db.transaction(async (tx) => {
      const t = await this.access(tx, user, id, 'ADMIN', true);
      if (t.status !== 'completed')
        throw conflict('NOT_COMPLETED', 'Awards are published once every fixture is complete.');
      await this.publishAwards(tx, t);
      await this.audit.record(
        {
          action: 'tournament.awards_published',
          entityType: 'tournament',
          entityId: id,
          actorUserId: user.id,
          workspaceId: t.workspaceId,
        },
        tx,
      );
      return this.awardsOf(tx, t);
    });
  }

  private async publishAwards(tx: Transaction, t: TournamentRow): Promise<void> {
    await tx
      .update(awardRecords)
      .set({ status: 'SUPERSEDED', supersededAt: new Date() })
      .where(
        and(
          eq(awardRecords.tournamentId, t.id),
          inArray(awardRecords.status, ['PUBLISHED', 'STALE']),
        ),
      );
    const rules = tournamentRules(t.sport as SportKey)!;
    const fixtures = await tx
      .select()
      .from(tournamentFixtures)
      .where(eq(tournamentFixtures.tournamentId, t.id));
    let champion: string | null;
    let runnerUp: string | null;
    if (t.format === 'single_elimination') {
      const final = fixtures.reduce<FixtureRow | undefined>(
        (a, f) => (!a || f.round > a.round ? f : a),
        undefined,
      );
      champion = final?.winnerEntryId ?? null;
      runnerUp =
        final && champion
          ? final.side1EntryId === champion
            ? final.side2EntryId
            : final.side1EntryId
          : null;
    } else {
      const table = await this.standingsOf(tx, t);
      champion = table[0]?.entryId ?? null;
      runnerUp = table[1]?.entryId ?? null;
    }
    const rows: (typeof awardRecords.$inferInsert)[] = [];
    const base = {
      tournamentId: t.id,
      criteriaVersion: 1,
      status: 'PUBLISHED',
      provenance: 'AUTO',
      matchVersion: 0,
    } as const;
    if (champion)
      rows.push({
        ...base,
        awardKey: 'champion',
        recipients: [{ kind: 'entry', id: champion }],
        metrics: {},
      });
    if (runnerUp)
      rows.push({
        ...base,
        awardKey: 'runner-up',
        recipients: [{ kind: 'entry', id: runnerUp }],
        metrics: {},
      });
    if (rules.playerAwards.length) {
      const { totals } = await this.playerTotals(tx, t);
      for (const rule of rules.playerAwards) {
        const won = playerAwardWinners(rule, totals);
        if (won) {
          rows.push({
            ...base,
            awardKey: rule.key,
            recipients: won.rosterMemberIds.map((id) => ({ kind: 'roster_member', id })),
            metrics: won.metrics,
          });
        }
      }
    }
    if (rows.length) await tx.insert(awardRecords).values(rows);
  }

  private async awardsOf(db: DbExecutor, t: TournamentRow): Promise<TournamentAward[]> {
    const rules = tournamentRules(t.sport as SportKey)!;
    const rows = await db
      .select()
      .from(awardRecords)
      .where(
        and(
          eq(awardRecords.tournamentId, t.id),
          inArray(awardRecords.status, ['PUBLISHED', 'STALE']),
        ),
      );
    const entries = await db
      .select()
      .from(tournamentEntries)
      .where(eq(tournamentEntries.tournamentId, t.id));
    const memberIds = rows.flatMap((r) =>
      (r.recipients as { kind: string; id: string }[])
        .filter((x) => x.kind === 'roster_member')
        .map((x) => x.id),
    );
    const members = memberIds.length
      ? await db.select().from(rosterMembers).where(inArray(rosterMembers.id, memberIds))
      : [];
    const name = (kind: string, id: string) =>
      (kind === 'entry'
        ? entries.find((e) => e.id === id)?.displayName
        : members.find((m) => m.id === id)?.displayName) ?? '?';
    const definitions: Record<string, { name: string; criteria: string }> = {
      champion: { name: 'Champion', criteria: 'Winner of the final, or top of the table.' },
      'runner-up': { name: 'Runner-up', criteria: 'Loser of the final, or second in the table.' },
      ...Object.fromEntries(
        rules.playerAwards.map((a) => [a.key, { name: a.name, criteria: a.criteria }]),
      ),
    };
    const order = Object.keys(definitions);
    return rows
      .sort((a, b) => order.indexOf(a.awardKey) - order.indexOf(b.awardKey))
      .map((r) => ({
        awardKey: r.awardKey,
        name: definitions[r.awardKey]?.name ?? r.awardKey,
        criteria: definitions[r.awardKey]?.criteria ?? '',
        status: r.status as TournamentAward['status'],
        provenance: r.provenance as TournamentAward['provenance'],
        recipients: (r.recipients as { kind: 'entry' | 'roster_member'; id: string }[]).map(
          (x) => ({ ...x, displayName: name(x.kind, x.id) }),
        ),
        metrics: r.metrics as Record<string, number>,
        publishedAt: r.publishedAt.toISOString(),
      }));
  }

  private async matchesOf(db: DbExecutor, fixtures: FixtureRow[]): Promise<Map<string, MatchRow>> {
    const ids = fixtures.flatMap((f) => (f.matchId ? [f.matchId] : []));
    if (!ids.length) return new Map();
    const rows = await db.select().from(matches).where(inArray(matches.id, ids));
    return new Map(rows.map((m) => [m.id, m]));
  }

  private async detailOf(db: DbExecutor, t: TournamentRow): Promise<TournamentDetail> {
    const [entries, fixtures] = await Promise.all([
      db
        .select()
        .from(tournamentEntries)
        .where(eq(tournamentEntries.tournamentId, t.id))
        .orderBy(asc(tournamentEntries.seed)),
      db
        .select()
        .from(tournamentFixtures)
        .where(eq(tournamentFixtures.tournamentId, t.id))
        .orderBy(asc(tournamentFixtures.round), asc(tournamentFixtures.position)),
    ]);
    const matchRows = await this.matchesOf(db, fixtures);
    const [fresh] = await db.select().from(tournaments).where(eq(tournaments.id, t.id));
    return {
      ...toTournament(fresh ?? t),
      entries: entries.map((e: EntryRow) => ({
        id: e.id,
        teamId: e.teamId,
        rosterMemberId: e.rosterMemberId,
        displayName: e.displayName,
        seed: e.seed,
      })),
      fixtures: fixtures.map((f) => {
        const m = matchRows.get(f.matchId ?? '');
        return {
          id: f.id,
          round: f.round,
          position: f.position,
          side1EntryId: f.side1EntryId,
          side2EntryId: f.side2EntryId,
          bye: f.bye,
          matchId: f.matchId,
          winnerEntryId: f.winnerEntryId,
          status: fixtureStatus(f, m),
          resultSummary: (m?.result as MatchResult | null)?.summary ?? null,
          needsDecision: f.needsDecision,
        };
      }),
    };
  }

  private async access(
    db: DbExecutor,
    user: AuthUser,
    id: string,
    role: 'VIEWER' | 'SCORER' | 'ADMIN',
    lock = false,
  ): Promise<TournamentRow> {
    const query = db.select().from(tournaments).where(eq(tournaments.id, id));
    const [t] = lock ? await query.for('update') : await query;
    if (!t) throw notFound();
    await requireWorkspaceRole(db, t.workspaceId, user.id, role, notFound);
    return t;
  }
}
