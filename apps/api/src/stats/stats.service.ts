import { Inject, Injectable } from '@nestjs/common';
import type {
  MatchResult,
  PlayerStats,
  SportKey,
  SportRecord,
  StatsQuery,
} from '@scoresphere/contracts';
import { getEngine } from '@scoresphere/sports';
import { and, eq, gte, inArray, lt, type SQL } from 'drizzle-orm';
import type { AuthUser } from '../auth/decorators';
import { ApiError } from '../common/api-error';
import { DB, type Database } from '../database/database.module';
import {
  matches,
  matchSides,
  matchSideParticipants,
  persons,
  rosterMembers,
  teams,
  tournamentFixtures,
} from '../database/schema';
import type { WorkspaceContext } from '../workspaces/workspace-access';

type MatchRow = typeof matches.$inferSelect;
interface Appearance {
  match: MatchRow;
  side: number;
  /** The player's participant ID in this match; null for team records. */
  participantId: string | null;
}

/**
 * Player and team statistics from completed matches (plan M7). Rosters are private to their
 * workspace, so these are only for its members; a user can also see their own career across
 * every workspace that has linked them.
 */
@Injectable()
export class StatsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async player(
    ctx: WorkspaceContext,
    rosterMemberId: string,
    query: StatsQuery,
  ): Promise<PlayerStats> {
    const [member] = await this.db
      .select()
      .from(rosterMembers)
      .where(
        and(eq(rosterMembers.id, rosterMemberId), eq(rosterMembers.workspaceId, ctx.workspaceId)),
      );
    if (!member) throw new ApiError(404, 'NOT_FOUND', 'Player not found.');
    const appearances = await this.appearancesOf([rosterMemberId], query);
    return { displayName: member.displayName, ...this.summarise(appearances) };
  }

  async team(ctx: WorkspaceContext, teamId: string, query: StatsQuery): Promise<PlayerStats> {
    const [team] = await this.db
      .select()
      .from(teams)
      .where(and(eq(teams.id, teamId), eq(teams.workspaceId, ctx.workspaceId)));
    if (!team) throw new ApiError(404, 'NOT_FOUND', 'Team not found.');
    const sides = await this.db
      .select({ match: matches, side: matchSides.side })
      .from(matchSides)
      .innerJoin(matches, eq(matches.id, matchSides.matchId))
      .where(and(eq(matchSides.teamId, teamId), ...this.filters(query)));
    const filtered = await this.inTournament(
      sides.map((s) => ({ match: s.match, side: s.side, participantId: null })),
      query,
    );
    return { displayName: team.name, ...this.summarise(filtered) };
  }

  /** The signed-in user's own career, across every workspace where they are linked. */
  async me(user: AuthUser, query: StatsQuery): Promise<PlayerStats> {
    const [person] = await this.db.select().from(persons).where(eq(persons.userId, user.id));
    if (!person) return { displayName: '', sports: [], recent: [] };
    const links = await this.db
      .select({ id: rosterMembers.id })
      .from(rosterMembers)
      .where(and(eq(rosterMembers.personId, person.id), eq(rosterMembers.linkStatus, 'LINKED')));
    const appearances = await this.appearancesOf(
      links.map((l) => l.id),
      query,
    );
    return { displayName: '', ...this.summarise(appearances) };
  }

  private filters(query: StatsQuery): SQL[] {
    const where: SQL[] = [eq(matches.status, 'completed')];
    if (query.from) where.push(gte(matches.endedAt, new Date(`${query.from}T00:00:00Z`)));
    if (query.to)
      where.push(
        lt(matches.endedAt, new Date(new Date(`${query.to}T00:00:00Z`).getTime() + 86_400_000)),
      );
    return where;
  }

  private async appearancesOf(rosterMemberIds: string[], query: StatsQuery): Promise<Appearance[]> {
    if (!rosterMemberIds.length) return [];
    const rows = await this.db
      .select({
        match: matches,
        side: matchSideParticipants.side,
        participantId: matchSideParticipants.id,
      })
      .from(matchSideParticipants)
      .innerJoin(matches, eq(matches.id, matchSideParticipants.matchId))
      .where(
        and(inArray(matchSideParticipants.rosterMemberId, rosterMemberIds), ...this.filters(query)),
      );
    return this.inTournament(rows, query);
  }

  private async inTournament(rows: Appearance[], query: StatsQuery): Promise<Appearance[]> {
    if (!query.tournamentId || !rows.length) return rows;
    const fixtures = await this.db
      .select({ matchId: tournamentFixtures.matchId })
      .from(tournamentFixtures)
      .where(eq(tournamentFixtures.tournamentId, query.tournamentId));
    const ids = new Set(fixtures.map((f) => f.matchId));
    return rows.filter((r) => ids.has(r.match.id));
  }

  private summarise(appearances: Appearance[]): Pick<PlayerStats, 'sports' | 'recent'> {
    const bySport = new Map<SportKey, SportRecord>();
    const sorted = [...appearances].sort(
      (a, b) => (b.match.endedAt?.getTime() ?? 0) - (a.match.endedAt?.getTime() ?? 0),
    );
    const recent: PlayerStats['recent'] = [];
    for (const { match, side, participantId } of sorted) {
      const sport = match.sport as SportKey;
      const record = bySport.get(sport) ?? {
        sport,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        metrics: {},
      };
      const result = match.result as MatchResult | null;
      const outcome =
        result?.winnerSide === undefined ? 'drawn' : result.winnerSide === side ? 'won' : 'lost';
      record.played++;
      record[outcome]++;
      const engine = getEngine(sport, match.engineVersion);
      if (engine && match.currentState) {
        for (const r of engine.stats(match.currentState)) {
          const mine = participantId
            ? r.participantId === participantId
            : !r.participantId && r.side === side;
          if (mine) record.metrics[r.metric] = (record.metrics[r.metric] ?? 0) + r.value;
        }
      }
      bySport.set(sport, record);
      if (recent.length < 10) {
        recent.push({
          matchId: match.id,
          sport,
          title: match.title ?? '',
          result: outcome,
          summary: result?.summary ?? '',
          endedAt: match.endedAt?.toISOString() ?? null,
        });
      }
    }
    return { sports: [...bySport.values()].sort((a, b) => b.played - a.played), recent };
  }
}
