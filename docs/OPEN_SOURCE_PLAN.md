# Open-source preparation and launch checklist

Updated 2026-11-20 on `nodejs-dev`. SyncBeats is already a public GitHub repository. This preparation adds an MIT license and contributor infrastructure locally; it does not publish the branch, rewrite Git history, or certify a complete security/license audit.

## Prepared

- Root MIT license, aligned package/lockfile license metadata, and a README explaining the product, design target, demo, and local setup.
- Contribution guide, security policy, code of conduct, third-party notices, roadmap, issue forms, and pull-request template.
- Sanitized root/frontend/visualizer environment examples. Private environment files, signing keys, uploads, logs, and local build outputs remain ignored.
- Read-only CI for package installs, Prisma generation, type checks, tests, and builds. Backend API tests use a separate PostgreSQL database. Existing frontend/visualizer lint debt is explicitly advisory.
- Weekly dependency-update configuration targeting `nodejs-dev`.
- Removed the unused root `rerank_example.py` after checking for references; it was a standalone external-service example outside the application.
- Removed the unused development Compose uploads volume and fixed container name. Local database/visualizer ports bind to loopback, and the visualizer receives its configured admin password.
- Untracked the 36.5 MB macOS `dev/syncbeats-server/bin/yt-dlp` dependency executable and added explicit ignore rules; the working copy remains available locally. Docker installs its own downloader, and fresh checkouts must install a supported downloader as described in the setup guide. Prior commits still contain the binary; removing it from the index does not shrink existing history.
- Checked the local file inventory and added Python-cache/signing-file ignores and Docker-context exclusions. The visualizer now has a `.dockerignore`; the backend excludes local environment variants, logs, uploads, cookies, and temporary files from its build context.

The local-file follow-up checked 17 excluded paths and 13 essential paths that must stay publishable. A fresh scan of 443 publishable files returned zero Gitleaks findings. The demo video, synthesized audio, and sidebar preview were retained after confirming references from application code or design documentation. `AGENTS.md` and four maintenance scripts are already tracked despite matching existing ignore rules; they remain intentional source/documentation files.
- GitHub description, website link, 16 relevant repository topics, and private vulnerability reporting were configured and read back successfully. Repository visibility was already public and was not changed.

The original synthesized demo loops stay: they are used by the landing page and have a checked-in generator and documented provenance. Application features, investigation notes, and native source were retained. Other in-progress source changes in this workspace belong to separate ongoing work.

## Secret review

Gitleaks was downloaded into a temporary audit directory and checked against its release SHA-256 checksum. A scan of a captured publish candidate (tracked files plus non-ignored new files, excluding private/generated files) returned **zero findings**. This is a bounded result, not proof that the project has no secrets.

An all-ref reachable-history scan returned four findings at these locations; values were fully redacted in temporary reports:

| Historical location | Finding | Required follow-up |
| --- | --- | --- |
| `rerank_example.py`, commit `d80aa1e8ae85`, line 6 | OpenRouter-format credential | Revoke/rotate the key if real; check provider usage |
| `GOOGLE_AUTH_SETUP.md`, commit `c99cd7335d46`, line 52 | Google-client-secret-format credential | Rotate the OAuth client secret if real |
| `docker-compose.yml`, commits `2eb137d89bdf` and `141de1a99dcd`, line 47 | Generic credential/signing-secret finding | Review historical/current reuse and rotate any real affected secret |

The old `socket-server/.env` also has a populated `JWT` field in reachable history (for example `752933fd0fdd`). `sockets/.env` has a populated `PORT` field; its existence alone is not evidence of a credential leak. Current validity of historical values was not tested.

Deleting files or adding ignore rules does not remove prior commits, forks, caches, or downloaded copies. Revoke real secrets first. If maintainers choose to rewrite history, coordinate branch protection, collaborators, forks, and deployments before doing so; this task does not perform that disruptive operation. Do not commit the temporary audit reports.

## Validation

Checks use an isolated captured workspace snapshot with fresh `npm ci` installs and disposable environment values. Backend `youtube-dl-exec` installation hit GitHub's unauthenticated download rate limit; its documented `YOUTUBE_DL_SKIP_DOWNLOAD=true` option allowed build/unit-test installation. Provider downloads were not exercised.

The recommendation API test requires `syncbeats_recommendations_test` on a local host. A disposable PostgreSQL 16 instance was created on a temporary loopback port, migrated, used for the API test, and stopped. CI supplies the same isolated database name.

Existing lint violations remain and are recorded as advisory rather than hidden. Ongoing auth/room source edits can change check results after a snapshot is captured. Run the package checks again on the exact branch revision chosen for publication.

Final captured-snapshot results:

| Package | Result |
| --- | --- |
| Frontend | Fresh install, type check, all 77 tests, and production build passed; lint reported existing violations |
| Backend | Fresh install with downloader download skipped, Prisma generation, type check, room/device tests, recommendation unit tests, API integration tests, and build passed |
| Database visualizer | Fresh install, Prisma generation, type check and production build passed; lint reported existing violations |

Documentation links, YAML syntax, environment-example ignore rules, and patch whitespace were checked. The final scan of 440 publishable source files returned zero Gitleaks findings. Generated check artifacts and dependencies were kept out of that source scan. Docker Compose startup, provider integrations, native clients, and two-device runtime playback were not verified by this preparation task.

## Remaining launch checks

- [ ] Confirm all copyright holders have authority to offer their original contributions under MIT and preserve any existing third-party notices.
- [ ] Revoke/rotate real historical credentials and review affected provider accounts and deployment settings.
- [ ] Decide whether coordinated history cleanup is needed after rotation; rescan the exact release revision and reachable history.
- [ ] Complete dependency/native-asset license review before distributing bundles. Root MIT does not license external music or trademarks.
- [ ] Review and merge/push the intended preparation files together with any separately reviewed source work. GitHub cannot detect the local license until it is published on the repository's default branch.
- [ ] Run GitHub CI on the chosen revision, and follow the setup guide against a fresh local database. Real room, provider, and multi-device checks remain required for related source changes.
- [ ] Review branch protection and deployment permissions. Require the package-check jobs once they run successfully on GitHub; public pull requests must not receive deployment credentials.
- [ ] Resolve existing lint debt and change lint from advisory to required.
- [ ] Scope a few real contributor issues, then apply `good first issue` or `help wanted` labels. Do not label complex synchronization work as beginner work without a clear boundary.

## Discovery

Description: “Listen together across devices. A self-hostable music synchronization app built with Next.js, Socket.IO and Web Audio.”

Website: <https://syncbeats.in>

Configured topics: `music`, `music-player`, `audio-synchronization`, `synchronized-playback`, `multi-device`, `web-audio`, `socket-io`, `real-time`, `typescript`, `nextjs`, `react`, `nodejs`, `postgresql`, `prisma`, `self-hosted`, `pwa`.

Topics are searchable descriptors, not a ranking guarantee. Improve discoverability with a working demo, a clear README, reliable setup, useful release notes, and responsive contributor reviews. Use Git tags for actual versions and releases, not keyword promotion. A screenshot or short demo showing a real room on multiple devices is a useful launch asset when that behavior has been verified.
