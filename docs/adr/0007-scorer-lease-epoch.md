# ADR 0007: Scorer lease: time-based lease with an offline grace period → lease with no time expiry, plus a monotonically increasing `lease_epoch` (fencing token) on every event

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D7](../../plan.md)

## Decision and rationale

- Handover happens explicitly, or by an admin force-takeover, which bumps the epoch.
- Events from a superseded epoch are rejected but preserved for review and export.
- Why: a long match with no signal would outlive any grace period. A dead battery mid-match is an MVP case, not a future one.
