# ADR 0009: Server validation policy: accept and flag instead of drop

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D9](../../plan.md)

## Decision and rationale

- An event can pass auth, schema, epoch and engine-version checks but still fail server engine validation.
- Such an event is stored, the match is flagged `NEEDS_REVIEW` (alert raised, awards blocked) and the event is not dropped.
- Why: those events are what happened on the field. A disagreement is a bug signal, not grounds to lose the match.
