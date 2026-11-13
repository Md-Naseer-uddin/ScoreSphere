# ADR 0023: Tournament and award schema fixes

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D23](../../plan.md)

## Decision and rationale

- Fixtures get nullable `side1_entry_id` and `side2_entry_id`, a nullable `match_id`, and bye support. The spec's `match_id UNIQUE NOT NULL` can't represent later knockout rounds whose sides aren't known yet.
- `award_records` gets `status` (CANDIDATE / PUBLISHED / STALE / SUPERSEDED), with uniqueness applied to published records only. This is what the spec's stale→republish workflow needs.
- v1 tournaments are single-workspace; cross-workspace (inter-school) entries come later.
