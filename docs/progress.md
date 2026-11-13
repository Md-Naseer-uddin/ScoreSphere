# Progress

Tracks where implementation of [plan.md](../plan.md) stands. A resumed session reads this first, then continues from **Next**.

## Status

| Milestone | Status |
|---|---|
| M0 — Foundations | in progress |
| M1 — Identity and workspaces | not started |
| M2 — People and rosters | not started |
| M3 — Walking skeleton: Badminton, offline-first | not started |
| M4 — Cricket | not started |
| M5 — Rally family + Chess | not started |
| M6 — Pilot release | not started |
| M7 — Tournaments, statistics, profiles | not started |
| M8 — Rules builder | not started |
| M9 — Football, Field Hockey, Basketball | not started |
| M10 — Kabaddi, Kho-Kho, Wrestling, Carrom | not started |
| M11 — v1.0 hardening | not started |

## M0 checklist

- [x] Git repo, remote, spec moved to `docs/spec/`
- [x] ADRs D1–D25 (+0026–0027), spec amendment notes, root `CLAUDE.md`
- [ ] Monorepo tooling (pnpm, Turborepo, TypeScript, ESLint, Prettier, Vitest)
- [ ] Packages: `config`, `contracts`, `engine-kit`, `sports`
- [ ] API skeleton (NestJS, config, logging, errors, health, OpenAPI, Drizzle)
- [ ] docker-compose (Postgres, MinIO)
- [ ] Client skeleton (Vite, React, Tailwind, router, query, i18n, Dexie, PWA)
- [ ] Capacitor Android project
- [ ] GitHub Actions CI (lint, typecheck, test, build, debug APK)

## Next

Monorepo tooling (pnpm workspace, Turborepo, TypeScript, ESLint, Prettier, Vitest).

## Needs the owner

- On-device checks of the CI-built APK (IndexedDB persists across kill/restart, keep-awake). Download the APK from the latest CI run.
- Staging deploy target. Nothing is deployed until a hosting provider is chosen.
