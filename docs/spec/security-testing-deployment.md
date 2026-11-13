# Security, Testing, Deployment and Operations

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0020](../adr/0020-session-transport.md), [0021](../adr/0021-share-link-fragment.md), [0025](../adr/0025-phone-verification-deferred.md), [0026](../adr/0026-adult-accounts-only.md), [0027](../adr/0027-apk-built-in-ci.md) (session transport, share links, no OTP, minors, APK built in CI). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

## 1. Authentication security

- Required account identifier: verified unique phone number.
- Passwords hashed with Argon2id using suitable current parameters; never encrypt or store plaintext password.
- OTPs are short-lived, one-time, hashed at rest, limited by attempts and rate-limited by phone/device/IP.
- Use generic responses for login, registration and password recovery to reduce account enumeration.
- Refresh credentials are rotated and revocable; store hashes server-side.
- Require re-verification for phone changes and high-risk account recovery.
- Secure cookies or carefully protected token storage; do not store password or long-lived bearer token in localStorage.
- Optional native biometric/PIN unlock uses device secure storage, not a replacement for server identity proof.

## 2. Phone-number privacy

- Treat phone numbers as personal data.
- Normalize to E.164; mask in UI and logs.
- Exact-match lookup only; authenticated and rate-limited.
- Discoverability defaults off.
- Do not expose account existence in public registration/recovery messages.
- Player lookup returns minimal data only with privacy permission.
- Pending claim is not proof of ownership until OTP verification.
- Define phone reassignment and account recovery policy.

## 3. Authorization and tenancy

- Workspace is the data ownership boundary.
- Every private query/mutation checks active workspace membership and role.
- Never rely on frontend hiding a button.
- Organization role changes and invitations are audited.
- Scorer lease authorizes match writes; spectator link authorizes read-only view only.
- Share tokens are high-entropy, hashed, expiring/revocable and scope-limited.

## 4. Upload/media security

- Accept only expected image types for avatars.
- Validate actual file signature, size and dimensions; do not trust file extension.
- Use signed short-lived upload URLs and private object storage by default.
- Re-encode/strip metadata where appropriate.
- Prevent SVG/script payload risks unless safely sanitized.
- Store object key, not raw binary in DB.

## 5. API and runtime security

- DTO/schema validation for every request.
- Parameterized DB access through Prisma.
- Rate-limit OTP, login, phone lookup, share-token access and expensive statistics.
- Set TLS, security headers, CORS allowlist and safe error handling.
- Keep secrets in environment/secret manager; rotate them.
- Use least-privilege DB user and separate dev/test/prod DB credentials.
- Validate WebSocket handshake and each privileged event; never trust a room name as authorization.
- Avoid logging sensitive payloads.

## 6. Privacy, consent and retention

- Document what profile fields are public, workspace-visible or private.
- Guest profiles stay local; match snapshots include only minimum participant display data.
- Provide account data export/deletion workflows.
- Define retention/anonymization behavior for completed matches when a user deletes an account.
- If children/minors may use the app, confirm applicable guardian/consent and data-protection requirements before launch.
- Obtain consent for SMS invitations and follow local telecom/provider rules.

## 7. Testing strategy

### Unit tests
- Every scoring engine: valid/invalid action, transition, score, result, replay, undo/correction.
- Rule evaluator: trigger, conditions, action, priority, reset, invalid config, cycle/depth protection.
- Timer state calculations.
- Award ranking/tie-break and tournament standings.
- Phone normalization and identity claim.

### Integration tests
- Registration with phone OTP grant.
- Duplicate phone rejection.
- Pending player account claim.
- Guest profile stays local (client test) and snapshot-only sync.
- Workspace isolation and role checks.
- Match event transaction and idempotent retry.
- Tournament fixture/standings recalculation.
- Award recalculation after corrected match.
- Share-token expiry/revocation.

### End-to-end tests
- Register → create team → add guest → create match → score → finish → view history.
- Register → add pending player by phone → player verifies/registers → profile links to same player → roster reflects linked account.
- Create tournament → generate fixtures → score matches → standings → awards.
- Score offline → close app → reopen → reconnect → sync once.
- Spectator opens live link → watches update → scorer revokes link → viewer loses access.

### Non-functional tests
- Load test scoring writes and spectators.
- Mobile low-memory and app-kill recovery.
- Timer drift/background/resume tests.
- Network loss/latency/duplicate request tests.
- Accessibility and responsive device matrix.
- Backup restore and migration rollback drills.

## 8. Deployment topology

- React web/PWA: static hosting/CDN.
- NestJS API: container/VPS/platform deployment.
- PostgreSQL: managed database with automated backups and point-in-time recovery where available.
- Object storage: avatars/media.
- Redis: optional for rate limit, distributed locks and Socket.IO adapter when multiple API replicas are deployed.
- Worker: optional outbox/notification/statistics processing; may begin as background process within same codebase.

## 9. Android APK distribution

- Package React client with Capacitor.
- Build Android project with Android Studio/Gradle.
- Sign release APK with a private signing key.
- Keep the keystore and passwords securely backed up; never commit them.
- Preserve signing identity for future update installation.
- Publish APK through official domain or controlled private distribution.
- Provide SHA-256 checksum, version/build number, release notes and minimum supported Android version.
- Users may need to allow installation from the browser/file manager source; warn that Android may show a Play Protect check.
- Implement in-app version check and clear update instructions. Direct APK users typically need to install a newer signed APK; do not assume silent auto-update.
- Build a PWA as an alternative installation path.

## 10. Operations

- Health/readiness endpoints.
- Structured logs with request/correlation IDs.
- Metrics for API latency, scoring action errors, timer state, sync queue, outbox retry, DB health and live socket counts.
- Error monitoring with PII scrubbing.
- Automated DB backups and restore tests.
- Migration deployment/rollback plan.
- Incident runbook for lost device, leaked share link, incorrect scoring release and sync backlog.
