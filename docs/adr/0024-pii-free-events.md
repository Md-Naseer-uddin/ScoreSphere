# ADR 0024: Event payloads are free of personal data

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D24](../../plan.md)

## Decision and rationale

- Events reference `participant_id` (`match_side_participants.id`), never phone numbers or names.
- Anonymizing a person means updating snapshot rows, while events stay immutable.
