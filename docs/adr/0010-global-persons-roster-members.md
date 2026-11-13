# ADR 0010: Player identity: global `persons` + workspace-scoped `roster_members`

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D10](../../plan.md)

## Decision and rationale

- In the spec, `players` is workspace-scoped, but `phone_identity_id` and `linked_user_id` are globally UNIQUE.
- So a person can exist in only one workspace: a second club can't add them, and cross-team history is impossible.
- Fix: `persons` is global (one per phone identity, optionally linked to a user). `roster_members` is per workspace (alias, jersey, optional `person_id`), with uniqueness on `(workspace_id, person_id)`.
