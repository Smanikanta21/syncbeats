# SyncBeats open-source launch plan

Prepared 2026-11-17 from the current `nodejs-dev` checkout at `4dc9a09cb9b97a10719449ed6aaacb7b52c250c9`. This document is a plan, not a completed security audit or public launch. No repository visibility, licenses, deployment settings or application code were changed.

## Recommendation

Open-source SyncBeats so contributors can run the synchronized playback core locally, understand its boundaries and land focused improvements. The most valuable first deliverable is a reproducible two-client demo using an owned/generated audio sample. It should work without production credentials or third-party music services.

Keep the web/server core, native clients and architecture available where ownership permits. Mark each platform's actual state and assign separate areas/maintainers; do not promise a working native audio engine from architectural notes alone. Publishing code invites contributions, but small reviewable issues, a working setup and timely review are what make contributions practical.

## Findings that affect launch

| Priority | Observed evidence | Required action / completion condition |
| --- | --- | --- |
| P0 | `README.md:338` says private/all rights reserved; no tracked root license. Backend `package.json:22` separately declares ISC. | Confirm ownership and contributor authority; select one coherent project license, preserve third-party licenses, align package metadata and README. |
| P0 | Reachable history includes `socket-server/.env` in `13529d09`, `2b70bf25`, `752933fd`; removed in `97f86578`. The inspected historical file has a populated `JWT` field. Its validity/current use was not established. | Scan all history/tags/branches for secrets without exposing values. Revoke/rotate any real credentials before publication. Decide how to sanitize history after rotation; deleting the latest file is insufficient. |
| P0 | `dev/db-visualizer/src/lib/adminAuth.ts:3` has a fixed fallback admin password. Lines 11–25 base64-encode the password and timestamp, then authenticate by decoding and comparing the password. | Fail closed when credentials are unset; replace this scheme with expiring, signed or random server-validated sessions that never contain the password. Rotate credentials/sessions if exposure is suspected. Keep the visualizer private or localhost-only. |
| P0 | `.env.example` is referenced by README but absent. Server `src/server.ts:4` and `prisma.config.ts:1` use default `dotenv/config`. | Supply a placeholder-only env template and document required/optional variables. Implement/test root-file loading explicitly; default dotenv loads relative to process working directory, so the documented root-only layout needs verification. |
| P1 | `docker-compose.dev.yml` starts PostgreSQL and the visualizer, not the entire app. `dev/syncbeats-server/bin/yt-dlp` is a tracked macOS Mach-O binary. Backend Dockerfile installs Python/yt-dlp, not ffmpeg. | Provide a clean local quickstart, pin/test prerequisites, replace platform-specific binary handling with documented platform-aware tooling and preserve notices. Verify whether the selected download/format path needs ffmpeg; install it when that path requires it. |
| P1 | Backend `package.json` has `db:start` and `sync-db` commands pointing to absent root `scripts/start-db.sh` and `scripts/sync-db.sh`. `.gitignore` broadly excludes scripts, most docs and server `tests/`. | Remove obsolete commands or ship safe, reviewed implementations. Review ignore rules so contribution documents, tooling and tests can be committed while secrets/local artifacts remain excluded. |
| P1 | `.github/workflows/syncbeats-CD.yml` is cloud deployment on pushes to `main`/`nodejs-dev`, plus a PR-closed staging-teardown path. Backend path filters apply. No ordinary fork-safe PR validation workflow was found. | Add separate PR checks for frontend/server and relevant native work. Run fixtures without secrets/network services. Protect deployment credentials behind trusted branch/environment rules. |
| P1 | `README.md:96` clone URL uses `sync-beats`; current origin is `Smanikanta21/syncbeats`. `AGENTS.md` says no tests and Prisma 7; current package scripts include tests and backend Prisma declarations are `^6.4.0`. | Correct onboarding and version/architecture claims from current source/lockfiles. Validate each documented command in a fresh checkout. Describe <25ms as a measured target with conditions, not a universal guarantee. |
| P1 | No tracked `CONTRIBUTING.md`, `SECURITY.md`, code of conduct, issue/PR templates or public roadmap found. `AGENTS.md` points to absent `implementation_plan.md`. | Add lightweight contributor/security docs and templates; point active tasks to a real roadmap. Give maintainers a private vulnerability channel and a realistic review process. |

The filename check found no currently tracked `.env`, private-key/certificate, upload or `node_modules` paths matching the bounded scan. This is not a secret-scan clearance: the historical `.env` is positive evidence that a full-history review is needed.

## License decision

Choose based on the desired reuse policy. Recommendation for maximizing developer adoption: **Apache-2.0**, subject to ownership and compatibility review. If the goal includes requiring hosted forks to share their covered modifications with users, choose **AGPL-3.0** instead.

| License | What it enables / requires | When to choose it |
| --- | --- | --- |
| Apache-2.0 | Broad reuse including commercial/proprietary products; license/notice obligations and an explicit contributor patent grant. Does not require forks to publish modifications. | Easy integration and broad adoption. |
| MIT | Broad reuse with copyright/license notice preservation; short and familiar. No explicit patent grant like Apache-2.0. | Maximum simplicity when that tradeoff is acceptable. |
| AGPL-3.0 | Copyleft, including offering corresponding source for covered modifications to users interacting over a network. Does not automatically make all unrelated systems open-source. | Keeping covered self-hosted/hosted improvements available. |
| GPL-3.0 | Copyleft obligations on distribution of covered software; ordinary hosting alone does not impose AGPL's network-source requirement. | Distributed applications where that policy fits. |

Inventory code copied from other projects before choosing a license. **ByTune is GPL-3.0**: copied/adapted code cannot be released solely under MIT/Apache-2.0. Independently implementing the ideas described in [the ByTune analysis](./BYTUNE_FETCHING_ANALYSIS.md) leaves more licensing flexibility. Audit artwork, fonts, binary tooling, samples and lyric/media rights too. Public visibility without a license is not enough to grant developers normal open-source reuse rights.

Confirm contribution authority from all relevant rights holders. Start with an inbound-equals-outbound contribution policy; a DCO/sign-off is an option if maintainers want an explicit provenance process. State that contributors grant the required rights under the selected license. Keep the SyncBeats name/logo/domain ownership and any trademark policy explicit and separate from source-code permission.

## Execution sequence

The effort estimates below assume one maintainer and a bounded first release; they are estimates, not deadlines. Security findings or ownership questions can extend them.

| Stage | Work | Reviewable deliverable and exit condition | Estimated effort |
| --- | --- | --- | --- |
| 1. Secure publication | History scan/credential rotation, visualizer auth/session fix, dependency/source/license inventory, publish-scope decision. | Redacted audit summary; confirmed rotations where necessary; safe auth; ownership and license decision. No known publish-blocking secrets. | 1–3 days, longer if remediation is substantial |
| 2. Reproducible developer setup | Root env handling, env template, pinned supported Node/toolchain, database migrate/seed, local audio demo, optional integration flags. | A fresh contributor checkout reaches a two-tab synchronized room using only local development configuration. | 2–3 days |
| 3. Contribution foundation | README, architecture/event reference, contributor/security docs, roadmap, templates, licenses/notices, PR CI and branch rules. | A sample fork PR runs validation without privileged credentials; docs match current behavior. | 1–2 days |
| 4. Public preview | Publish sanitized repository/state, preview release, screenshots/demo, first issues, discussions/support scope. | Tagged preview with known limitations and reproducible instructions; issue board is ready for contributions. | 1 day after stages 1–3 pass |
| 5. First contribution cycle | Review small PRs, improve confusing onboarding, measure actual sync, introduce source/lyrics adapters. | First external PRs merged with meaningful evidence and a documented release cadence. | Ongoing |

Do not switch repository visibility until stages 1–3 meet their exit conditions. Before updating the public branch, reconcile intended changes: this worktree is `nodejs-dev`, twelve commits ahead of its upstream at inspection time, with a pre-existing untracked root `package-lock.json`. Those facts do not identify a publication-ready `main` state. Review the intended diff and release branch rather than blindly publishing the working directory.

If history is sanitized, rotate credentials first, retain needed ownership/license attribution, back up privately and coordinate rewritten refs with existing collaborators. A clean public import is another option, but it still requires rotation and preserving applicable attribution. No history rewrite or visibility change is performed by this plan.

## Developer experience to ship

### Quickstart acceptance scenario

1. Clone the correct public URL and use the documented supported Node version.
2. Copy the root env template; generate local-only credentials without production access.
3. Start PostgreSQL with the dev compose file; keep admin services on loopback or disable them for the normal demo.
4. Run `npm ci` per application, generate Prisma, apply migrations and seed only safe development data. Confirm backend uses the intended root env.
5. Start backend and frontend with documented ports/CORS/socket configuration.
6. Create/sign in with a local development user through an explicit dev-only setup that does not require Google or Resend. No production auth bypass.
7. Create/join a room from two tabs, upload an owned/generated sample, and test ready/play/pause/resume/seek/reconnect.
8. Run the documented validation commands; make external YouTube/Spotify/lyrics checks opt-in integration tests.

Keep production OAuth/email/S3/Redis/music-provider integrations optional for core contributions. Clearly document which features need credentials and which are unavailable when an integration is disabled. Include an owned/generated audio fixture and its license, not a popular commercial track.

### Repository documents and settings

- `README.md`: product purpose, demo/screenshot, real platform status, quickstart, validation, links and selected license.
- `CONTRIBUTING.md`: setup, branch/PR conventions, focused changes, verification expectations, migration rules and review process.
- `SECURITY.md`: private reporting channel, supported versions and handling policy. Avoid forcing vulnerability reports into public issues.
- `CODE_OF_CONDUCT.md`: expectations and a reachable moderation contact.
- `docs/ARCHITECTURE.md`: Room/RoomManager/SocketHandler boundaries, readiness and timeline, adaptive sync, API/socket events, auth and persistence.
- `docs/ROADMAP.md`: web/server/native status, first contribution areas, explicit non-goals for the current release.
- `.github/ISSUE_TEMPLATE/` and `PULL_REQUEST_TEMPLATE.md`: reproducible bug reports, device/network context, expected behavior and verification.
- `.env.example`, toolchain version file, `LICENSE`, third-party notices as required; `CODEOWNERS` when review ownership is established.
- Public branch rules: required CI/review where feasible, no direct untrusted deployment, secret scanning/push protection if available, restrained workflow permissions and dependency updates.

Use these documents as the real project entry points; reconcile `AGENTS.md` with them rather than maintaining contradictory setup instructions.

## First issues for contributors

| Area | Proposed issue | Definition of done |
| --- | --- | --- |
| Onboarding | Make root env loading and the quickstart consistent | Fresh clone starts both apps and migrates/seeds DB using documented root configuration. |
| Documentation | Document socket payloads and readiness transitions | Types/examples agree with source; play/resume/reconnect behavior is explained. |
| Reliability | Add a two-client readiness/reconnect regression check | Reconnect with a loaded track re-declares readiness; same-track resume avoids unnecessary timeout. |
| Lyrics | Separate metadata matching, fetching and parsing from the UI | Typed provider contract; deterministic matching fixtures for live/remix/sped-up/missing-artist cases. |
| Lyrics | Add timing quality and supplied-versus-estimated metadata | UI and data distinguish real word timings, line timings and plain/estimated output. |
| Audio | Introduce a provider adapter and expiry recovery contract | Catalog/resolution/serving are separate; expired URL and rendition-change behavior are tested. |
| Native Apple | Validate and complete AVAudioEngine scheduling with compatible audio | Existing `Services/AudioEngine.swift` is reviewed against current behavior; AAC/M4A loads safely; clock/scheduling behavior is measured; room snapshot readiness is handled. This is a substantial task, not a beginner issue. |
| Measurement | Publish sync measurement methodology | Distinguish reported clock/playback drift from audible output skew; record device/network/startup conditions and known Bluetooth latency. |

Label small docs/setup tasks `good first issue`; larger protocol/audio work needs a short design review. Ask contributors to claim or discuss significant work so duplicate implementations do not pile up.

## Validation and release gate

Required PR checks should run `npm ci`, then the scripts actually defined in each current package: frontend typecheck/lint/tests/build, server typecheck/tests/build, and visualizer checks when touched. Use PostgreSQL service containers for database-dependent checks, deterministic fixtures for network providers and a targeted manual/two-client playback check for sync changes. Native work gets the corresponding platform build and scheduling checks. Do not assume all scripts currently pass; establish and document the baseline first.

During this audit, frontend `npm test` was attempted. The standalone LRC parser checks passed; six other test files could not load because the `typescript` dependency is absent in this worktree. This is an environment limitation, not evidence of six functional bugs. No dependency installation, full build, running server, two-device measurement or public-provider availability test was performed for this documentation task.

Before preview publication, verify:

- Ownership/license/third-party notice decisions are recorded.
- Historical and current secret review is complete; any real affected secrets were rotated.
- Visualizer auth/session findings are fixed and admin access is restricted.
- Clean-checkout demo and required CI pass without production credentials.
- Roadmap and native/sync claims describe observed status and limitations.
- The chosen public branch/tag includes the intended reviewed code and excludes private data.

For the music/lyrics enhancement design and pinned ByTune evidence, see [BYTUNE_FETCHING_ANALYSIS.md](./BYTUNE_FETCHING_ANALYSIS.md).

Before launch, also address the reproduced hosted MIME/container mismatch and reliability work in [YOUTUBE_AUTH_DOWNLOAD_DIAGNOSIS.md](./YOUTUBE_AUTH_DOWNLOAD_DIAGNOSIS.md).
