# ADR 0020: Session transport (the spec left it open)

- **Status:** Accepted
- **Date:** 2026-11-13
- **Source:** [plan.md §2.2 D20](../../plan.md)

## Decision and rationale

- Access token: JWT, about 15 minutes, held in memory only.
- Refresh token: opaque, rotating, with reuse detection.
  - **Web:** httpOnly, Secure, SameSite=Strict cookie scoped to `/api/v1/auth/refresh` on a same-site API subdomain.
  - **Capacitor:** stored in Keystore-backed secure storage and sent in the request body. API cookies from `https://localhost` are third-party in the WebView.
- Offline scoring needs no server auth. A device may score offline for a configurable window since its last successful refresh.
