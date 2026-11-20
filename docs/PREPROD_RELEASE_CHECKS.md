# Pre-production checks — 19 November 2026

Target: `nodejs-dev` in the Orca workspace. The changes serving localhost were transferred from the separate `macos-dev` checkout, preserving the native Swift tree. The local branch already contains 12 landing-page commits after remote commit `d1cdbfc2`.

The release includes the current web brand/landing updates, authenticated recommendations and interests, song-duration persistence, session-check/retry loader, island layout/progress fixes, lyrics proxy, visible-page wake locks, audio URL/proxy corrections and source-investigation reports. The streaming comparison is at `/stream-test`, behind login, and does not replace synchronized room playback.

## Git hygiene

- Ignore dependencies, `.next`, build output, TypeScript caches, secrets, downloads, local scratch and database dumps.
- Stop blanket-ignoring source scripts, backend tests and documentation. Allow Prisma source migrations through the existing SQL-dump ignore rule.
- Remove an empty accidental root lockfile from the checkout; the frontend and backend retain their own lockfiles.
- Remove package scripts that referenced untracked database-maintenance shell files. The documented Prisma commands remain available.
- The staged files and the earlier commits being pushed contain no new matching credential values in the targeted secret scan. The recommendation test generates its own ephemeral JWT secret.
- Native Swift/Android changes from the localhost checkout are excluded from this web/backend push.

## Validation

- Frontend: production build, typecheck and 47 tests passed. The six playlist-scale tests distinguish fixtures from live provider behavior.
- Backend: production build, typecheck, room queue/playback/persistence tests and recommendation ranking tests passed.
- All four migrations applied to an isolated local test database. Recommendation API checks passed for authentication, identity isolation, persistence, event idempotency, consent, durable feedback, reset and history ownership.
- Source migration `20261119100000_recommendation_interests` is included; deployment runs `prisma migrate deploy` before replacing the backend.
- Existing broader lint failures remain; this release does not claim a clean repository-wide lint run.
- Browser screenshot capture was unavailable during the earlier localhost session. Pixel layout and actual mobile streaming require pre-production testing.

## After deployment

1. Open the pre-production frontend and reload with a saved session. Check the session loader, retry when the server is unreachable, and login on mobile.
2. Open a room on two devices. Verify room snapshots, ready states, play/pause/seek and reconnect behavior.
3. Import a public Spotify playlist and confirm its metadata count and one import-progress display. Audio is still resolved/downloaded lazily; playlist size is not a download count.
4. Visit `/stream-test` after login. Check audio startup, forward/backward seeking, buffering and the partial-request probe on desktop Chrome and mobile Safari. The sample can require a server download if not cached. This tests the SyncBeats audio endpoint, not a fresh direct Google CDN URL.
5. Check recommendation onboarding, feedback and reset. Verify LRCLIB availability; the proxy can return a stable unavailable response when the upstream network fails.

Pushing this branch triggers the existing backend VM deployment workflow. The frontend is hosted separately; its deployment status must be checked independently of backend success. No production `main` push or merge is included.
