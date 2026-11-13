# ADR 0011: Three participant kinds

- **Status:** Accepted (owner decision)
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D11](../../plan.md)

## Decision and rationale

| Kind | Identity | Stored | Searchable | Tournament stats / awards |
|---|---|---|---|---|
| **Player** | phone → `person` | server | exact-phone lookup only, per privacy | yes |
| **Roster member** | name / jersey only, no phone | server, private to the workspace | never | yes; can later be linked to a person by invite + consent |
| **Quick guest** | device-local | device; minimal snapshot per match | never | match scorecard only; can be promoted to roster member |

- Why: organization co-scorers need shared rosters, tournament stats need a stable ID, and most school students have no accounts.
- UX: the primary choices are Player and Roster member. Quick guest is offered in the quick-match flow.
