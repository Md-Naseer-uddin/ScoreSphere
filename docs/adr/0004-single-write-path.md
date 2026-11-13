# ADR 0004: One write path

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D4](../../plan.md)

## Decision and rationale

- The spec has separate `/actions`, `/corrections` and `/sync/.../events` endpoints, separate online and offline flows, and lifecycle endpoints.
- Instead, the client is always local-first:
  - every action commits to the local DB and the sync queue;
  - a single `POST /matches/:id/events` takes a batch of one or more events;
  - online simply means the queue drains immediately.
- Offline is the only code path, so nothing has to be retrofitted later.
