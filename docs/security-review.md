# Security review and release checklist

Review for v1.0 (plan M11), 14 November 2026. Findings first, then the checklist to run before every release.

## Findings

| Area | What is in place | Result |
|---|---|---|
| Dependencies | `pnpm audit --prod`: no known vulnerabilities. With development dependencies: 3 moderate and 1 low advisory, all in build and test tools (drizzle-kit's esbuild loader, the Nest CLI, testcontainers, Workbox's build step, ESLint). None ships to users. | Accepted. Recheck at every release; update when the tools release fixes. |
| Accounts | argon2id passwords; account lockout; rotating refresh tokens with reuse detection; recovery codes; 18+ only (ADRs 0020, 0025, 0026). | No issues |
| Authorization | Every workspace route checks membership and role. Authorization matrices cover workspaces, teams, people, matches, tournaments, stats and rulesets: outsiders get 404 so a workspace's existence isn't revealed, and lower roles get 403. | No issues |
| Rate limits | 120 requests a minute per IP by default. Tighter limits on sign-in, registration, password reset, account export and deletion, avatar upload, phone lookup and public live views. | No issues. Production refuses to start with rate limits off. |
| Web headers | CSP (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`), HSTS, `Referrer-Policy: no-referrer`, `nosniff`, `X-Frame-Options: DENY` and Permissions-Policy, on every nginx location. | No issues |
| Live links | Share tokens are stored hashed, travel in the URL fragment and a header (never the path), and can be revoked and expire (ADR 0021). | No issues |
| Personal data | Events carry participant IDs only (ADR 0024). Logs redact phone numbers, tokens and passwords; the e2e log scan fails the build if any appear. Data export and account deletion exist (DPDP). | No issues. Legal review is pending with the owner. |
| Uploads | Avatars are checked by signature, re-encoded and stripped of metadata. | No issues |
| Custom rules | Rules are data, never code. They are checked against each sport's catalogue on save and again at match creation; chains are limited in depth and effects (ADR 0032). | No issues |
| Offline devices | A signed-in account stays usable offline for 14 days (ADR 0031). Device data is scoped to the account. | Accepted risk, documented in the lost-device runbook |

**Not done in this review:**
- An independent penetration test.
- A review of the hosting setup, since nothing is deployed yet.

Both are listed for the owner.

## Release checklist

1. `pnpm format:check && pnpm lint && pnpm typecheck && pnpm build && pnpm test`, then `pnpm e2e` (Postgres running). The log scan must report no personal data.
2. `pnpm audit --prod` reports nothing high or critical. Look at any new development advisory.
3. CI is green on the release commit, including the debug APK.
4. If engines changed:
   - The golden logs pass on both builds.
   - Changed behaviour has a new engine version (ADR 0019).
   - `MIN_CLIENT_VERSION` is raised when old clients must not create matches.
5. Migrations have been tried on a copy of production data. Take a backup first ([backup-restore](runbooks/backup-restore.md)).
6. If ingestion or live streams changed, run the [load test](runbooks/load-testing.md).
7. Tag the release so `release.yml` builds the signed APK. Publish the checksum and release notes on the download page.
8. After deploying, check `/api/v1/health`, the metrics (`scoresphere_matches_needs_review`, `scoresphere_live_matches_scorer_quiet`) and the error webhook.
