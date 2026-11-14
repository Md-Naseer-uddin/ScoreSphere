# ADR 0032: Rule effects are computed in the fold, not stored

- **Status:** Accepted
- **Date:** 2026-11-14
- **Source:** plan D16b and M8; refines ADR 0016 ("rules engine in two layers")

## Context

- Plan D16b says a rule's actions run back through the engine and are "recorded as derived events carrying the rule ID and version".
- Storing those effects as ledger rows conflicts with how the ledger already works:
  - **Undo and corrections.** A `VOID` or `REPLACE` of the triggering event (ADR 0005) would leave stored effects behind. The ledger would then need a second kind of correction for effects, and every client would have to agree on it.
  - **Sequence numbers.** The scoring device numbers events (ADR 0030). A stored effect needs a `seq` of its own, and the server's lenient replay could disagree about whether a rule fired.
  - **Replay.** A stored effect duplicates what replay can work out again from the rules and the event that triggered them.

## Decision

- **The rules live in the match.**
  - `CREATED` carries the match's rules (`rules`) and, when they came from a saved ruleset, its version (`rulesetVersionId`).
  - Like the settings, the rules are pinned for the life of the match. Editing a ruleset makes a new version and never changes matches already created.
- **Effects are derived during the fold.**
  - When a scoring command is applied, engine-kit runs the match's rules on the facts it produced. A matching rule's actions go through the engine's `validate` and `apply` like any command.
  - The results become `DERIVED` timeline entries on the triggering event, carrying the rule's ID and name.
  - Nothing is written to the ledger, so undoing or correcting the triggering event removes or recalculates its effects automatically. Client and server compute them the same way.
- **Rules are data, limited to what the engine declares.**
  - Each engine declares a `ruleCatalogue`:
    - the facts that can trigger a rule;
    - the typed state variables that conditions can read;
    - the commands that actions can use.
  - `validateRules` checks a ruleset against the catalogue when it is saved and again when a match is created. Unknown triggers, fields, operators that don't fit a field's type, bad values, unknown commands and missing parameters are all refused.
- **Order and limits.**
  - Rules fire in priority order (high first), then by ID.
  - Each rule fires at most once per scoring event, so cycles end.
  - Facts produced by effects can trigger further rules, down to a depth of 3, with at most 20 effects per event.
  - An effect the engine refuses (for example, penalty runs after the innings has ended) is recorded on the timeline as invalid and skipped. It never blocks the scorer's own event.
- **Statistics see effects** because effects change the engine state that statistics are computed from.

## Consequences

- Changing a sport's rule catalogue, or the meaning of one of its commands, changes how existing matches replay. It needs a new engine version (D19), like any other engine change.
- A match with rules needs a client that understands rules. The release that ships rulesets raises the minimum client version, so older apps can't score these matches without the rules.
- The scoring screen can show rule effects under the event that caused them. Undo still targets only the scorer's own events.
