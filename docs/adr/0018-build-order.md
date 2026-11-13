# ADR 0018: Build order re-sequenced (§5)

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D18](../../plan.md)

## Decision and rationale

The spec's order and its problems:
- Offline sync (step 16) and live sharing (15) came last.
- The rules builder (4) came before any engine (7).
- Stats and awards (14), rate limits (18) and Capacitor (17) all came late.

New order:
- A walking skeleton on Badminton proves the full pipeline before Cricket.
- Stats and award metrics are part of every sport's definition of done.
- Rate limiting on registration and login ships with auth in M1.
- The Capacitor shell exists from M0.
