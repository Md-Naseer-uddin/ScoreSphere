# ADR 0001: ORM: Prisma → Drizzle ORM + drizzle-kit SQL migrations

- **Status:** Accepted (owner decision)
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D1](../../plan.md)

## Decision and rationale

- The schema depends on CHECK constraints (exactly one recipient, target or entry), partial unique indexes (active memberships), typed `jsonb` (engine state and configs) and aggregate SQL (standings, leaderboards).
- All of these are native in Drizzle. Prisma needs hand-edited migration SQL and types `jsonb` loosely.
