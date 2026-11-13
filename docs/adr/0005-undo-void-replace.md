# ADR 0005: Undo and correction: per-engine compensating logic → ledger-level `VOID(seq)` and `REPLACE(seq, command)`

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D5](../../plan.md)

## Decision and rationale

- State is a fold over the non-voided events.
- After a mid-match correction, all later events are re-validated. If any become invalid, the correction is rejected with an explanation, and the scorer undoes back to that point instead.
- Engines implement forward `apply` only.
- Why: writing inverse logic for 12 engines, plus reversing rule side-effects, is a large bug surface. Replaying a few thousand events takes milliseconds.
