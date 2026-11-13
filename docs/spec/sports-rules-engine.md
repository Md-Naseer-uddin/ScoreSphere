# Sports Catalogue, Rules Content and Configurable Rules Engine

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0015](../adr/0015-sports-content-in-code.md), [0016](../adr/0016-rules-engine-two-layers.md) (content and presets in code, two-layer rules engine). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

## 1. Supported sports

Initial sports: Cricket, Badminton, Tennis, Chess, Kabaddi, Volleyball, Basketball, Wrestling, Football, Kho-Kho, Field Hockey and Carrom. More sports should be added through the sport registry and a new scoring engine adapter.

## 2. Two separate concepts: rules reference and executable ruleset

### Rules/reference section
A user-facing educational area for each sport. It includes:
- Overview and objective.
- Court/field/board and team/player setup.
- Scoring explanation.
- Match formats.
- Periods/sets/innings/rounds.
- Fouls, penalties and special situations.
- Tie-break and result rules.
- Glossary/examples.
- Governing-body source, edition/version and effective date.

Use concise original explanations and link to governing-body material. Do not reproduce entire copyrighted rulebooks unless permission/license allows it. Show that rules can vary by age group, event, competition level and local format.

### Executable match ruleset
A validated configuration that the scoring engine applies to one match. It contains settings and, where enabled, custom conditional rules. A match pins an immutable version at start.

## 3. Rule inheritance and resolution

Suggested resolution order:
1. Sport engine invariants (cannot be overridden).
2. Selected sport format defaults.
3. Official/casual rule template settings.
4. Workspace/user custom ruleset settings.
5. Match-level overrides permitted by schema.
6. Validated conditional rules.

Store the final resolved configuration and source ruleset version with the match. Editing the source ruleset later creates a new version and does not change active/completed matches.

## 4. Trigger-condition-action (TCA) DSL

Rules are JSON data evaluated by a deterministic allow-listed evaluator. Never execute user-supplied JavaScript, SQL, expressions or dynamic imports.

Conceptual shape:

```json
{
  "id": "consecutive-wide-bonus",
  "enabled": true,
  "priority": 100,
  "trigger": "cricket.delivery.recorded",
  "conditions": [
    { "field": "innings.consecutiveWides", "operator": "gte", "value": 2 }
  ],
  "actions": [
    { "type": "score.addExtraRuns", "value": 1, "reason": "local-wide-rule" }
  ],
  "reset": [
    { "trigger": "cricket.delivery.legal", "action": "counter.reset", "field": "innings.consecutiveWides" }
  ]
}
```

This is an illustrative DSL. Exact semantics must be defined by the Cricket engine, including whether the configured threshold applies to the second wide or subsequent wides. Do not infer local-rule behavior from ambiguous prose; expose threshold and effective delivery in the builder.

### Supported trigger examples
- `cricket.delivery.recorded`, `cricket.wicket.recorded`, `cricket.over.completed`
- `football.goal.recorded`, `football.card.issued`, `football.period.completed`
- `basketball.score.recorded`, `basketball.foul.recorded`, `basketball.period.completed`
- `kabaddi.raid.started`, `kabaddi.raid.ended`, `kabaddi.tackle.recorded`
- `chess.clock.started`, `chess.move.completed`, `chess.clock.expired`

Each sport has its own trigger catalogue.

### Condition operators
Allow only typed operators such as `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `notIn`, `and`, `or`, `not`, `exists`. Validate operand type, path, allowed range and operator compatibility.

### Action examples
- Add/subtract score or runs.
- Add penalty.
- Change an explicitly permitted match state field.
- Start/stop a named timer.
- Increment/reset a sport-specific counter.
- Change possession/serve/active side where the sport engine permits it.
- Trigger period/round/phase transition only where permitted.

### Engine safeguards
- Only allowlisted state paths/actions per sport.
- Deterministic evaluation order (priority then stable ID).
- Maximum rules/actions per event and evaluation depth.
- Detect cycles/repeated rule firing.
- Validate final state with sport engine invariants.
- No negative/invalid score unless sport semantics explicitly permit it.
- Log which rules fired and the rule version.
- Rule evaluation must be deterministic for replay and offline parity.

## 5. Rule builder UX

1. Select a sport and format.
2. Choose official/casual preset.
3. Duplicate preset into a custom ruleset.
4. Choose trigger.
5. Configure one or more conditions.
6. Choose action and value.
7. Choose reset behavior/priority if applicable.
8. Run preview against sample events.
9. Validate and save as a new version.

Do not expose triggers/actions that the selected sport cannot support.

## 6. Sport-specific configuration examples

### Cricket
- Overs, wickets, players per side, innings count.
- Legal ball/extras semantics.
- No-ball/wide run values.
- Powerplay/field restrictions where relevant.
- Free hit behavior where format supports it.
- Retired hurt/retired out, run out, stumping, caught, bowled, etc.
- Strike rotation and end-of-over logic.
- Custom local rules such as gully-cricket wide/one-tip/six-out rules.

### Badminton
- Singles/doubles.
- Points to win a game, games to win match.
- Two-point lead and cap rules.
- Service court/rotation and interval settings.

### Tennis
- Sets, games, advantage/no-ad mode, tie-break format, final-set rules, service order.

### Chess
- Time control per side, base time, increment, delay, stages, pause and flag-fall behavior. Rules of chess moves/checkmate are a separate chess rules library/domain requirement if move validation is ever added; this app initially needs a clock and result control, not necessarily a full chess playing engine.

### Kabaddi
- Match duration, periods, raid duration, bonus line behavior, super tackle conditions, do-or-die raid and all-out scoring according to selected rule version.

### Volleyball
- Sets, points to win, two-point lead, deciding set target, substitutions/timeouts and rotation tracking.

### Basketball
- Period count/duration, shot clock, three-point line configuration, foul limits, overtime and timeout settings.

### Wrestling
- Style/category, period duration, scoring actions, caution/penalty system, technical superiority and match-ending criteria for the selected rule version.

### Football
- Match/half duration, stoppage time, extra time, penalty shootout, substitution limit and card rules.

### Kho-Kho
- Innings/turn duration, chasing/defending order, dismissals, points and side change.

### Field Hockey
- Quarter/period duration, goals, penalty corners, cards/suspension duration, shootout rules.

### Carrom
- Board points, queen cover, foul penalties, break rules, turn order and match target.

## 7. Rule content sourcing and versioning

For each sport store `source_name`, `source_url`, `edition`, `effective_from`, `effective_until`, `competition_level` and last reviewed date. Candidate governing bodies include ICC, BWF, ITF, FIDE, relevant international/national Kabaddi bodies, FIVB, FIBA, UWW, IFAB, Kho-Kho governing bodies, FIH and carrom governing bodies. Confirm official current publications before shipping rule content. Never describe a casual preset as official.

## 8. Acceptance criteria

- Each of 12 sports has a rules/help section.
- Official source and edition are visible where applicable.
- User can select a preset and configure supported settings.
- Custom TCA rules validate before save.
- Engine rejects unsupported actions and impossible state transitions.
- Match references immutable ruleset/schema/engine versions.
- Event replay produces the same result as live scoring.
