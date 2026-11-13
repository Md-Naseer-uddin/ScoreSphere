# ADR 0016: Rules engine in two layers, sequenced after the engines exist

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D16](../../plan.md)

## Decision and rationale

- **(a) Typed settings schema per sport (Zod), built with each engine.** It covers most real local variants: overs, six-and-out, last-man-stands, one-tip-one-hand, wide-penalty thresholds, golden point, and so on.
- **(b) Trigger-condition-action (TCA) rules.** Their actions are limited to commands the engine declares (e.g. `cricket.awardPenaltyRuns`). They run back through `engine.apply` and are recorded as derived events carrying the rule ID and version.
- The builder ships after the pilot. Each later sport adds its rule catalogue as part of its definition of done.
- Why: the spec's actions write allow-listed state paths. That bypasses engine invariants, and statistics built from events would never see rule effects. Trigger and action catalogues come from the engines, so they can't be built before them.
