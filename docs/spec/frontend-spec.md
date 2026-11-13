# Frontend Technical Specification

> **Amended (2026-11-14):** parts of this document are superseded by ADRs [0003](../adr/0003-client-storage-dexie.md), [0011](../adr/0011-participant-kinds.md), [0021](../adr/0021-share-link-fragment.md) (Dexie on Android too, participant kinds, share-link fragment). Where they disagree, the [ADRs](../adr/) and the root [plan.md](../../plan.md) win.

## 1. Technology

- React + TypeScript + Vite (unless existing repository uses an equivalent supported setup).
- Tailwind CSS.
- React Router.
- TanStack Query for remote server state.
- Zustand for UI/active match state where needed.
- IndexedDB/Dexie for PWA local data.
- SQLite adapter for Capacitor Android.
- Socket.IO client for spectators and live updates.
- Capacitor for APK packaging.

Avoid Redux unless state complexity later justifies it. Keep scoring domain state in the shared scoring package and durable local DB; do not make React component state the only source of match truth.

## 2. Routes

Public:
- `/live/:shareToken` — read-only live match.
- `/privacy`, `/terms`, `/download`.

Authentication:
- `/auth/register`
- `/auth/verify-phone`
- `/auth/login`
- `/auth/forgot-password`
- `/auth/reset-password`

Authenticated:
- `/app`
- `/app/workspaces`
- `/app/profile`
- `/app/sports`
- `/app/sports/:sportKey`
- `/app/sports/:sportKey/rules`
- `/app/rulesets`
- `/app/rulesets/:id/edit`
- `/app/teams`
- `/app/teams/:id`
- `/app/players/:id`
- `/app/matches/new`
- `/app/matches/:id/score`
- `/app/matches/:id/summary`
- `/app/history`
- `/app/tournaments`
- `/app/tournaments/:id`
- `/app/statistics`
- `/app/settings`

## 3. Main navigation

Mobile bottom navigation: Home, Sports, Matches, Teams, Profile. Tournaments can appear in dashboard/secondary navigation or as a top-level tab if user research shows frequent use. Live scoring view should use a focused, distraction-free layout with its own top bar and explicit exit/finish controls.

## 4. Profile UX

- Profile image picker/camera (where supported), preview, crop and upload status.
- Display name, optional full name/email/bio/date of birth/language/city.
- Verified phone displayed masked; change phone requires OTP verification.
- Profile discoverability toggle defaults off.
- Account and device/session settings.

## 5. Team member UX

Add-member sheet presents two prominent choices:

### Guest
- Name required; optional jersey number/role/avatar.
- No phone input and no server lookup.
- Save in local guest directory.
- Show label `Guest · This device only` on profile/roster.
- Explain that guest reusable profile won't transfer to another device.

### Player
- Phone field with India `+91` default and 10 digits.
- Search button/loading state.
- Discoverable registered account card: avatar/name and Add Player action.
- Registered but not discoverable: privacy-safe invite/request action; no sensitive identity disclosure.
- No account: ask for display name, confirm phone, create pending claimable player profile.
- Pending claim: display “Invite pending” and allow edit/resend/cancel as permitted.
- After account registration/claim, refresh profile link without creating another roster identity.

## 6. Sports UI

Each sport profile includes:
- Overview.
- How scoring works.
- Match formats.
- Rules and source edition.
- Select preset/custom ruleset.
- Recent matches.
- Start match.

## 7. Match setup UX

Common steps: sport → format → sides/players → ruleset → format settings/timers → participant confirmation → review → start. Avoid forcing a user to create a team; allow quick temporary match sides with player snapshots when appropriate.

## 8. Scoring screen principles

- Keep score and current phase visible at all times.
- Use large thumb-sized action controls.
- Undo is immediately reachable but confirmation is required for destructive reset/finish.
- Show current scorer and sync state.
- Display timer(s) clearly and use distinct controls for each clock.
- Show recent event timeline and correction flow.
- Use haptic/sound feedback as optional settings.
- Prevent accidental browser navigation from losing unsaved local events.
- Support landscape for some sports but do not require it.

Sport-specific UI must reflect the actual engine actions. No generic “+1” screen for every sport.

## 9. Match/tournament awards UX

- Award card identifies scope: Match or Tournament.
- Show award name, recipient, sport, event/tournament and relevant metric snapshot.
- Label automatic vs organizer-selected award.
- If overridden, show “Selected by organizer” (do not expose internal reason publicly unless intended).
- Tie result UI supports shared award or configured tie-break explanation.
- Do not show Best Batter/Bowler in sports where those metrics do not exist.

## 10. Live spectator page

- No login for a valid public share link.
- Read-only state; no scoring controls.
- Show connection state: Live, Reconnecting, Last updated, or Offline/stale.
- Snapshot first; incremental updates after.
- Respect share visibility fields and revoke/expiry immediately where possible.

## 11. Offline UI

Persistent status indicator:
- Online & synced.
- Offline — saving on this device.
- Sync pending (count).
- Syncing.
- Sync failed — action required.
- Conflict — local events preserved.

Never show “Saved” until the local DB transaction succeeds. When online scoring is accepted, show synced status only after server acknowledgement.

## 12. Accessibility and quality

Semantic HTML, keyboard use, screen-reader labels for scoring controls, focus handling, high contrast, non-color status indicators, large tap targets and reduced-motion support. Test under slow network, low memory and small screens.
