# SyncBeats Mac beta release

Branch policy: keep the beta implementation, configuration, documentation, and packaging on **`macos-dev` only**. Promotion to `main` and publication are separate release decisions. The generated DMG/ZIP files remain local under the Git-ignored `releases/macos/` directory until shared.

Production API: `https://api.syncbeats.in`. HTTP requests and Socket.IO use this origin; the socket path is `/socket.io/`. Both Debug and Release default to production. Debug alone accepts a validated `SYNCBEATS_API_URL` launch override, for example `http://localhost:4000`. Release ignores it. No backend secrets belong in the app.

## Current verification

Checked 2026-11-20: production `/health` and the polling Engine.IO handshake return 200; the TLS WebSocket Engine.IO handshake also succeeds. `/auth/me` and `/rooms/mine` reject unauthenticated requests with 401. These probes establish routing and availability, not authenticated playback or deployed API compatibility. Twelve native configuration checks cover both build modes and backend override validation.

Release compilation passed on the local arm64 Mac with signing disabled. The current deployment target is **macOS 26.6**, so beta testers need that version or later. Decide the beta minimum OS before inviting testers; lowering it requires a separate availability audit and testing on that OS.

The local keychain contains Apple Development identities only. No Developer ID Application identity was found. The project selects team `WK3Q328X6P`; confirm the intended paid Apple Developer team and its certificates/profiles before archiving. The Release compilation check uses `CODE_SIGNING_ALLOWED=NO`; its product is not a distributable beta.

## Selected first beta: ad-hoc DMG and ZIP

The initial beta uses direct downloads without a paid developer account. It is ad-hoc signed for bundle integrity, has no Developer ID or notarization, and may be blocked by Gatekeeper. This is not the Developer ID distribution route below. Google sign-in is disabled for this package because associated domains require developer-team capability; use email login/registration. Apple Music import remains a test limitation until verified with this signing configuration.

Run `python3 'Syncbeats(apple)/distribution/package-beta.py' --beta 1 --build-number 2`. It compiles Release with production endpoints and the paid-team associated-domain flag disabled, signs the copied app ad-hoc with the baseline sandbox/network entitlements, creates DMG/ZIP, verifies them, and writes checksums and a manifest. Repeated versions are rejected to avoid overwriting a published beta; increment both arguments for the next beta.

Artifacts are written under `releases/macos/1.0-beta.1/`. Share the `.dmg`, `.zip`, `INSTALL.txt`, and `SHA256SUMS.txt` only. The build folder, logs, source, `.env`, signing files, and repository are not downloads. Keep source versioned in Git for maintenance; including or publishing it is optional and separate from app packaging.

Test a freshly downloaded copy on another Apple Silicon Mac before widening invitations. Tester instructions describe macOS's normal Open Anyway flow, with no Gatekeeper disabling or quarantine-removal commands. Both packages contain the same app; updates are manual.

## Later route: TestFlight

1. Confirm paid Apple Developer Program membership, access to App Store Connect, and the intended signing team. Register the app's current bundle ID `Syncbeats.Syncbeats` and its macOS app record. Keep the bundle ID stable once testers start installing; if changing it before first distribution, account for Keychain session migration.
2. Review Release capabilities: App Sandbox, hardened runtime, outgoing network access, Apple Music permissions, and associated domains (`webcredentials:syncbeats.in`). Configure each entitlement on the registered App ID. Only ship permissions needed by features testers can use. Verify sign-in and website association in the signed build.
3. Set version and build number. Current values are version 1.0 / build 1; every uploaded build needs a new build number. Set a beta label in release notes, keep the production API, and include a support/feedback destination and privacy policy.
4. In Xcode select Syncbeats / My Mac, then Product → Archive. In Organizer validate and distribute through App Store Connect. Resolve signing/capability errors and review export-compliance questions based on actual encryption usage.
5. In App Store Connect → TestFlight, enter beta description, What to Test, feedback email, review contact details, and a dedicated review/test account when login is required. Give access to a small internal group first.
6. Run the production smoke checklist below on a clean installation of that exact uploaded build. Then create an external tester group, submit the first external build for beta review, and invite a small initial cohort or enable its public link.
7. Collect crash reports and TestFlight feedback. Fix blockers, increment the build, and upload again. TestFlight builds are available for up to 90 days; up to 100 internal App Store Connect users and 10,000 external testers are supported.

## Alternative: direct signed download

Use this route if the beta needs distribution outside TestFlight. It requires a Developer ID Application certificate from the paid team, a Release archive signed for Developer ID distribution, hardened runtime, and the correct production entitlements. Sign nested code correctly through Xcode export, submit the exported app/container with `xcrun notarytool submit --wait`, and staple the returned notarization ticket to the app and supported distribution container. Verify with `codesign --verify --deep --strict`, `spctl --assess --type execute`, and a fresh downloaded copy on another Mac before sharing a versioned DMG/ZIP. Include feedback and update instructions. A Developer ID Installer certificate is needed for a signed PKG. This Developer ID route is preferable for a wider beta. The selected initial ad-hoc beta has the installation limitations described above; do not ask testers to disable Gatekeeper.

## Production smoke checklist before invitations

- Clean install and upgrade: launch, permissions, session persistence, sign out/in, email verification/reset, and Google sign-in. Sessions are stored under the backend host, so an existing localhost login will require a production login.
- Dedicated production test accounts/room: create/join with the Mac and a web or second Mac client. Verify server-authoritative queue changes, play/pause/seek/next, sample scheduling, and measured drift. Do not reset production data for a test.
- Audio loading failures, downloads, readiness on pause/resume, disconnect/reconnect, sleep/wake, and recovery after network changes. Test the actual cloud/LAN transitions that are implemented; avoid claiming unavailable hybrid behavior.
- Apple Music library permission, playlist access/import, bridge resolution, queueing, and failure recovery against the deployed production routes. Record limitations in What to Test.
- Artwork, lyrics, discovery and account/profile endpoints must work against deployed server versions. Current source can be newer than production.
- Full-screen player entry/exit, notch hover/click/transport, multiple displays, reduced motion, and return of the menu bar after dismissal or switching apps.
- Gatekeeper launch and signing entitlements on a second clean Mac; confirm supported macOS versions and chip architectures. The current local compile validates this Mac's arm64 destination, not an Intel build.
- Monitor backend errors, download/external-provider load, and native crash diagnostics during the initial cohort. Keep the previous beta build and a rollback plan; shipping the client does not deploy uncommitted server changes.

## Commands

```sh
python3 'Syncbeats(apple)/verification/run-native-configuration-checks.py'

# Compilation only; not a signed or notarized release artifact.
xcodebuild -project 'Syncbeats(apple)/Syncbeats/Syncbeats.xcodeproj' \
  -scheme Syncbeats -configuration Release -destination 'platform=macOS' \
  -derivedDataPath /tmp/syncbeats-beta-release-build CODE_SIGNING_ALLOWED=NO build
```

References: [Apple TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/), [notarizing macOS software](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution), [Developer ID](https://developer.apple.com/developer-id/).
