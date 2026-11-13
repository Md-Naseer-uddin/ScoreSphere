# ADR 0002: Realtime: Socket.IO + outbox + Redis adapter → Server-Sent Events (SSE) + Postgres `LISTEN/NOTIFY`

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D2](../../plan.md)

## Decision and rationale

- The spec already sends every write over REST, so realtime is strictly server→client.
- SSE reconnects natively with `Last-Event-ID`. Setting that to the match version gives exactly the catch-up semantics needed.
- SSE is plain HTTP (no sticky sessions), and NestJS supports it with `@Sse()`.
- `pg_notify` issued inside the write transaction is delivered **only on commit**. That gives "broadcast after commit" without an outbox table and fans out across API instances without Redis.
- A missed notification self-heals: the client sees a version gap and catches up.
- Cost: `LISTEN` needs one dedicated, non-pooled connection per instance. Add WebSockets only if bidirectional realtime (multi-scorer) is ever built. An outbox returns only if notifications are added.
