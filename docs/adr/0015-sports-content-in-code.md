# ADR 0015: Sports catalogue, formats, presets, award definitions and rules help content live in code, not DB seed tables

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D15](../../plan.md)

## Decision and rationale

- They sit in per-sport package folders and are bundled into the client, so they work offline, are versioned in git, reviewable and translatable.
- The DB keeps only:
  - `sport_key`;
  - user-created rulesets;
  - records that reference `criteria_version`.
- A match references either `preset_key@version` or `ruleset_version_id`, and stores the resolved config. This fixes the spec's FK, which made official presets unusable at match start.
- Why: behaviour is code anyway, and a DB `calculation_config jsonb` with no versioned code behind it is an unaudited way to change award outcomes.
