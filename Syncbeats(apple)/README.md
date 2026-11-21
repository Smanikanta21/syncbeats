# Native Mac app rebuild

## Current macOS beta

Beta development stays on **`macos-dev` only**. The current local package is **1.0 beta 1, build 2**, targeting **Apple Silicon and macOS 26.6+** with the production API at `https://api.syncbeats.in`. It is ad-hoc signed, not notarized, and supports email sign-in/registration; Google sign-in is disabled in this package. Installation on a second Mac and full production flows remain to be validated.

See the [root README](../README.md#macos-beta--macos-dev-branch) for local DMG/ZIP paths and installation notes, and the [beta release guide](planning/MACOS_BETA_RELEASE.md) for packaging and verification. Source remains in the repository and is excluded from the downloads.

## Development history and setup

The old Swift application source was removed and backed up on 2026-11-15 at the user's request. Xcode configuration, package resolution, permissions, and artwork are retained. A new SwiftUI app now implements the approved first-launch and account flow.

Implemented: a centered, skippable launch animation; three introduction cards; dark/light appearances with gold and bronze accents; email login/signup; email verification/resend; six-digit password reset; Keychain session storage and recovery; and direct entry into the user's native room. The room includes live Socket.IO snapshots, artwork, queue, YouTube search/enqueue, server-authoritative playback controls, and connected devices. The default Mac window is 960 × 720, with a 720 × 560 minimum. Small/short room windows keep transport controls visible while content scrolls.

The entry composition grows with both window width and height. Compact account panels cap at 1080 points; spacious windows grow toward 1480, with taller panels, larger headings, readable controls, and a slightly wider story column. Short windows retain compact sizing. Below 660 usable points the account columns stack. Introduction text, artwork, and navigation use the same sizing policy. Field values and card selection survive resizing.

The Mac downloads and decodes audio before scheduling playback with AVAudioEngine. Native clock probes, adaptive drift correction, pause/resume and seeking follow authoritative room snapshots. It declares `playback:blocked` only while its current audio is unavailable and re-declares readiness after reconnects. Local protocol/audio checks use synthetic files; physical multi-device timing remains to be measured. Apple Music matching, direct subscription playback and hybrid LAN synchronization remain the next milestones.

The island silhouette has concave shoulders that flare into the screen edge, with rounded lower corners. A single display-linked spring drives its size, corner geometry, and content reveal; content stays mounted during closing, and reversing direction preserves motion instead of snapping. Reduced Motion skips the transition. The display link stops when the island settles.

The notch companion shares the same room session and controls. Its black surface blends with the camera cutout, with artwork and status in compact mode, then transport, next track, and an Open room action on expansion. Hover to expand, pin to keep open, Escape to collapse; enable/disable it with the room switch or Room → Notch player (⌥⌘N). The interaction reference is [NotchNook](https://lo.cafe/notchnook); the component styling uses SyncBeats' own palette. It prefers a notched display and uses a floating island below the menu bar otherwise. Screen changes reposition it. The panel bypasses normal window constraining and the hosting view disables automatic safe-area insets; `NotchGeometry` reserves the real camera width explicitly.

## Build and verification

Open [the Xcode project](Syncbeats/Syncbeats.xcodeproj), select the **Syncbeats** scheme and **My Mac**, then run. Preserved deployment targets are macOS 26.6 and iOS 18.6; this delivery was built for arm64 macOS using Xcode 27.2. Shipping OS support remains a product decision.

The Debug macOS build passed, and 30 checks passed against a local Postman stand-in using the production Swift API/model code. These cover account state, JSON requests, timeouts, invalid credentials, server failures, token recovery, Google callback validation, and a real Keychain roundtrip. See [verification instructions and limits](verification/README.md). Frontend typecheck and the association route's ESLint check passed. Live account, email delivery, and live Google provider flows have not been exercised.

Debug builds omit Associated Domains so the app can be developed with a free Personal Team. A Debug macOS build with the existing Apple Development certificate succeeded on 2026-11-15, without signing overrides or provisioning-update flags; the signed app has no Associated Domains entitlement and keeps the sandbox enabled. UI, email authentication, and Keychain storage remain available. The Google button explains that this build does not enable its HTTPS return.

Google sign-in in new source builds uses a browser callback and a short-lived PKCE code. Associated Domains and paid-team provisioning are no longer required in Debug or Release. Use your Personal Team and automatic signing; Xcode's usual Run action is supported. The currently packaged beta above predates this change. Deploy the native Google migration and updated backend/website before testing real account login; see [the setup notes](planning/MACOS_GOOGLE_SIGN_IN.md).

Debug builds use `http://localhost:4000` by default; Release builds use `https://api.syncbeats.in`. Development launches can override `SYNCBEATS_API_URL` (HTTPS, or localhost HTTP) and `SYNCBEATS_GOOGLE_CLIENT_ID`. Start the backend with `npm run dev` in `dev/syncbeats-server`, then run the app in Xcode. Tokens stay in Keychain; UserDefaults stores appearance, introduction completion, notch visibility, and device identity.

Run with **⌘R** to load code changes. In Xcode's debug console (**⇧⌘Y**), select **All Output** and filter for `SyncBeats`. Startup, HTTP status/timing, socket lifecycle, recommendation loading and audio preparation emit diagnostics. Debug builds mirror these to stderr; unified logs use subsystem `in.syncbeats.native`. Headers, request/response bodies, query strings, room IDs and media URLs are omitted. If interests return 503, check the backend's `[Recommendations]` line; `P2021`/`P2022` indicates the configured database needs its pending Prisma migrations.

On first signup/login, the shared account music profile is checked before the dashboard appears. New profiles open a skippable Languages → Artists → Listening modal; saved or skipped profiles proceed directly. The same modal opens from **Edit interests**, with scrolling choices and a fixed footer. All listed languages/artists/genres are selectable, and users can add other favorites by name. A failed save keeps the draft; an unavailable profile offers retry or continuation for the current session.

The expanded player uses an inset Liquid Glass shared queue, neutral current-track highlights, a compact queue toggle and bounded artwork/content sizing for maximized windows. Reduce Transparency and Increase Contrast select a solid queue surface. The Mac Debug build and 16 native render scenarios passed structural checks; these do not establish on-device visual approval.

The next milestones add Apple Music library matching and direct subscription playback, and hybrid cloud/LAN synchronization to this workspace. The two music modes use distinct renderers and measured sync strategies.

See [the native desktop rebuild plan](planning/SWIFT_DESKTOP_PLAN.md) for architecture, UI direction, delivery phases, and acceptance checks. That plan supersedes the implementation/status descriptions in the retained `CLAUDE.md` for this rebuild.

The web playback bug tracker remains separate in [implementation_plan.md](../implementation_plan.md).

## Standalone HTML UI examples

Open any file directly in a browser; CSS and JavaScript are inline and no installation is needed. These are visual prototypes with sample data, not a working Swift app.

- [Selected premium design](planning/premium-desktop.html): studio dark mode and gallery light mode, with restrained gold accents and both music-mode previews.
- [First launch and authentication](planning/first-launch.html): skippable launch animation, three intro cards, login/signup, password reset, and email-verification previews in both appearances.
- [01 — Premium dark studio](planning/01-studio.html): artwork, persistent queue, library rail, and devices.
- [03 — Premium light gallery](planning/03-light-gallery.html): editorial typography and warm room panels.
- [02 — Dark visualizer](planning/02-dark-visualizer.html): earlier alternative, not the selected app direction.
- [Original three-direction comparison](planning/swift-desktop-directions.html): retained exploration reference.
