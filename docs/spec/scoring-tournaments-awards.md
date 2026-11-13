# Scoring Engines, Tournaments, Awards and Statistics

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0005](../adr/0005-undo-void-replace.md), [0006](../adr/0006-lifecycle-and-clocks-as-events.md), [0015](../adr/0015-sports-content-in-code.md), [0023](../adr/0023-tournament-award-schema.md), [0024](../adr/0024-pii-free-events.md) (undo via VOID/REPLACE, lifecycle events, award status, fixture model). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

## 1. Shared scoring contract

Each sport engine implements a common contract while retaining sport-specific state and actions.

Conceptual contract:

```ts
interface SportScoringEngine<State, Action, Result> {
  initialize(config: MatchConfig): State;
  validate(state: State, action: Action, context: EngineContext): ValidationResult;
  apply(state: State, action: Action, context: EngineContext): TransitionResult<State>;
  deriveResult(state: State): Result;
  getAvailableActions(state: State): ActionDefinition[];
  isComplete(state: State): boolean;
  replay(events: ScoringEvent[], snapshot?: State): State;
}
```

`undo` should be implemented through a validated compensating event or controlled rebuild, not physical deletion of accepted events. Use shared deterministic code where possible so offline and server state transitions match. The server validates authoritative results.

## 2. Sport-specific scoring requirements

### Cricket
- Ball-by-ball delivery events; runs, boundaries, extras, wickets, legal ball count, over/innings transition.
- Track striker/non-striker, bowler, batter runs/balls/fours/sixes, bowler overs/maidens/runs/wickets, extras and fall of wickets.
- Formats: configurable overs, wickets, innings and local/gully presets.
- Special cases: wide/no-ball do not count as legal deliveries where applicable; byes/leg-byes; run-out; retired hurt/out; strike changes; free hit where selected; super over if supported.
- Awards: Player of Match, Best Batter, Best Bowler, tournament Player of Tournament, Best Batter, Best Bowler. Define tie-break criteria.

### Badminton
- Singles/doubles, rally points, server/receiver, service court, game/set/match wins, deuce and cap rules.
- Awards: match MVP/player recognition and tournament champion/finalist; additional awards only if supported metrics are meaningful.

### Tennis
- Point → game → set → match; love/15/30/40/deuce/advantage or no-ad; service order; tie-break and final-set rules.
- Awards: match player of match where competition format uses it; tournament champion/finalist and optional performance awards.

### Chess
- MVP scope is a chess clock and match result tracker, not necessarily full legal move validation.
- Two independent clocks, base time, increment, delay, pause/resume, stage transitions, flag fall, draw/resign/agreement and winner.
- Persist timer transitions and result events. Use monotonic time in native app where possible; server timestamps are authoritative for synchronized session state.
- Awards: tournament champion, runner-up and performance categories only if tournament rating/points data exists.

### Kabaddi
- Team sides, periods, raid lifecycle, raid countdown, raider, defenders, touch/tackle/bonus, all-out, revival and substitutions as per configured rule version.
- Awards: Player of Match/Tournament, Best Raider, Best Defender and other categories only when stats are captured.

### Volleyball
- Rally scoring, sets, server/rotation, substitutions, timeouts, set/match completion.
- Awards: MVP, Best Spiker, Best Blocker, Best Setter, Best Libero only when the scorer records sufficient player-level events.

### Basketball
- Period/quarter, 1/2/3-point scores, player fouls, team fouls, free throws, timeouts, shot clock, overtime.
- Player stats: points, rebounds, assists, steals, blocks, turnovers, fouls and minutes if tracked.
- Awards: Player of Match/MVP, Top Scorer, Rebounds Leader, Assists Leader, tournament MVP and leaders.

### Wrestling
- Style/weight/category metadata, periods, point-scoring actions, cautions/penalties, technical superiority, pin/fall and result.
- Awards: match winner; tournament champion, silver/bronze/medal positions by bracket; best wrestler only if organizer defines criteria.

### Football (association football)
- Goals, assists (optional), own goals, penalties, cards, substitutions, halves, stoppage time, extra time, shootout.
- Player stats: goals, assists, cards, saves (if tracked), minutes and appearances.
- Awards: Player of Match, Top Scorer, Best Goalkeeper, Player of Tournament, Golden Boot and other categories based on captured stats.

### Kho-Kho
- Chasing/defending innings/turns, player dismissals, points, turn timer, side changes, match winner.
- Awards: Player of Match/Tournament, Best Chaser, Best Defender if relevant metrics are captured.

### Field Hockey
- Goals, penalty corners, penalties, cards/suspensions, periods, shootout, player substitution.
- Awards: Player of Match, Top Scorer, Best Goalkeeper, Player of Tournament.

### Carrom
- Player/team turns, coins pocketed, queen and cover, fouls, penalty coins, board points and match target.
- Awards: match winner, tournament champion and optional best performer using defined point metric.

## 3. Match event envelope

Each scoring action is an immutable event:

```json
{
  "eventId": "uuid-generated-on-client",
  "matchId": "uuid",
  "deviceId": "uuid",
  "localSequence": 17,
  "expectedMatchVersion": 16,
  "eventType": "CRICKET_WIDE_RECORDED",
  "payload": { "batterId": "player-id", "extraRuns": 1 },
  "clientOccurredAt": "2026-11-13T12:00:00Z",
  "engineVersion": "cricket-v1"
}
```

The server assigns authoritative `sequence_number` and resulting `match_version`. Client event IDs are idempotency keys. Store actor and device IDs when available.

## 4. Tournaments

Tournament is a first-class entity grouping fixtures/matches and aggregate stats/awards.

### MVP formats
- League/round-robin.
- Single-elimination knockout.

Future formats: groups followed by knockout, double elimination, series and Swiss where justified.

### Core workflow
1. Create tournament with name, sport, format, ruleset version and dates.
2. Add team/player entries.
3. Configure fixture generation and tie-break rules.
4. Generate rounds/fixtures.
5. Create or attach match for each fixture.
6. Score match using the normal sport scoring engine.
7. On completion, update result/standings projections.
8. Calculate eligible award candidates.
9. Organizer reviews/publishes awards and final standings.

### Standings
Use sport/format-specific standings strategies. Generic fields may include played, wins, draws, losses, points, score-for, score-against, differential and rank, but the meaning and tie-break order vary by sport. Save the selected tie-break configuration on the tournament. Standings must be reproducible from completed results.

## 5. Awards system

Awards are defined per sport and scope. Do not assume every sport supports batting/bowling or the same player metrics.

### Award scope
- MATCH: generated after a match is completed.
- TOURNAMENT: generated from all eligible completed tournament matches.

### Award calculation modes
- AUTO: engine calculates a winner from tracked statistics.
- MANUAL: authorized organizer chooses recipient.
- AUTO_WITH_OVERRIDE: system proposes a winner; organizer may override with reason.

### Shared award definitions
- Player of the Match.
- Player of the Tournament.
- Champion/runner-up/team champion (team awards where applicable).

### Sport-specific examples
| Sport | Match awards | Tournament awards |
|---|---|---|
| Cricket | Player of Match, Best Batter, Best Bowler | Player of Tournament, Best Batter, Best Bowler |
| Football | Player of Match, Top Scorer, Best Goalkeeper | Player of Tournament, Golden Boot, Best Goalkeeper |
| Basketball | MVP, Top Scorer, Rebounds Leader, Assists Leader | Tournament MVP, scoring/rebound/assist leaders |
| Kabaddi | Player of Match, Best Raider, Best Defender | Player of Tournament, Best Raider, Best Defender |
| Volleyball | MVP, Best Spiker/Blocker/Setter where tracked | Tournament MVP and position awards |
| Hockey | Player of Match, Top Scorer, Best Goalkeeper | Player of Tournament, Top Scorer, Best Goalkeeper |
| Kho-Kho | Player of Match, Best Chaser/Defender | Player of Tournament, Best Chaser/Defender |
| Badminton/Tennis | Match winner/player recognition | Champion, runner-up, optional MVP if event defines it |
| Chess | Winner/draw result | Champion, runner-up, optional performance award |
| Wrestling | Match winner | Weight/category champion and medal placements |
| Carrom | Board/match winner | Tournament champion and optional points leader |

Only enable award metrics that are actually captured. Do not fabricate goalkeeper saves, assists, rebounds or similar statistics if the scorer did not record them.

### Award calculation and audit
For each award store:
- Definition and scope.
- Candidate set and relevant metrics snapshot.
- Metric/calculation version.
- Tie-breaking policy.
- Auto/manual/override provenance.
- Selected recipient (player/team snapshot).
- Selecting user and override reason where applicable.
- Publication timestamp.

Tie handling must be configurable: shared award, defined tie-break metric, or manual organizer decision. Show users why the recipient was selected (e.g. runs, wickets, goals, assists, points) where appropriate.

## 6. Player/team statistics

Store raw scoring events as facts. Use sport-specific projection services to compute aggregates. Suggested scopes: match, tournament, season/date range, workspace and career.

Do not keep a single generic `points` statistic for all sports. Use metric keys with sport-specific definitions and units. Keep aggregation versioned so results can be recomputed after a bug fix without rewriting source events.

## 7. Acceptance criteria

- Each sport engine has a tested state machine and result calculation.
- Match scorecard can be reconstructed from events.
- Undo/correction never destroys audit history.
- Tournament fixtures reference real match records.
- Standings derive from completed match results and configured tie-breaks.
- Awards are only offered where supported by metrics or manual selection.
- Awards retain calculation snapshot and selection method.
- Tournament-level awards recalculate when a valid match correction changes source statistics, with an audit trail and explicit republication workflow.
