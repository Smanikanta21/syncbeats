# SyncBeats native Mac rebuild

2026-11-19: the first local AVAudioEngine playback implementation and album-derived full-screen player are complete. See [MACOS_AUDIO_AMBIENT_PLAYER.md](./MACOS_AUDIO_AMBIENT_PLAYER.md) for validation and remaining audio/LAN work.

Drafted: 2026-11-15. Updated: 2026-11-16. Status: source reset complete; first-launch/account flow, native room control workspace, and notch companion implemented and macOS build verified. The first native audio path is implemented; further music/LAN and hardware calibration milestones remain planned.

## Product direction

The UI polish is tracked in [MACOS_UI_POLISH_PLAN.md](MACOS_UI_POLISH_PLAN.md) on `macos-dev`: its unslop direction, [standalone HTML prototype](macos-ui-polish.html), native implementation report, and acceptance checks. Native studio/gallery polish is implemented; the Debug build, 30 room/notch checks, and native layout renderer passed. Live room review still needs the local Debug backend at `localhost:4000`.

Build a macOS app in Swift and SwiftUI around the web app's existing room, queue, and shared playback model. Add native Apple Music library discovery, precise audio scheduling, and a hybrid cloud/LAN transport. The Mac should feel like a music studio: artwork, the room's devices, and the queue form one workspace, with fast library access and a compact player when the main window is closed.

The user confirmed both library matching and direct Apple Music subscription playback. These share library browsing but require distinct room playback modes and renderers. The selected UI pairs the first artwork-led studio layout with dark mode and the third gallery layout with light mode. Preserve those compositions and refine them with restrained gold details; the dark visualizer direction is no longer the main app direction.

macOS is the first delivery target. Existing iOS configuration is preserved; an iOS rebuild and Windows app are separate work. The existing native `CLAUDE.md` describes the discarded implementation and does not establish that any old feature remains implemented.

## Reset and preserved setup

- Removed all 22 existing Swift application source files, including the entry point, views, models, network services, sync, cache, audio, and notch code.
- Preserved the Xcode project/workspace, Swift package lockfile and Socket.IO dependency, signing/build settings, generated Info.plist settings, permissions, app icons, and asset catalogs.
- Preserved existing uncommitted artwork and web changes. A temporary archive of the exact removed working-tree sources was saved outside the repository.
- The reset temporarily removed the entry point. The new `App/SyncBeatsApp.swift` recreates it, and the native first-launch/account implementation builds for macOS. Audio, sync, room sockets, and library source remain absent until their subsequent milestones.
- Configuration currently includes macOS deployment target `26.6`, iOS `18.6`, and both platform families. Validate the shipping macOS minimum and MusicKit capability when creating the new shell; do not silently change preserved configuration during planning.

## Reference implementation and compatibility

The current working tree, rather than older architecture notes, is the behavioral reference. This was a source audit, not a runtime sync measurement.

| Existing source | What the native implementation should preserve |
|---|---|
| `dev/frontend/components/room/RoomDashboard.tsx` | Now playing, queue, device controls, lyrics/EQ, room sharing, reactions/chat, and inline connection states |
| `dev/frontend/lib/syncClock.ts` and `hooks/useRoom.ts` | Four-timestamp NTP estimation, monotonic elapsed time, filtered samples, reconnect and readiness handling |
| `dev/frontend/hooks/useAdaptiveSync.ts` | Four network tiers and EWMA blending of the six current numeric parameters |
| `dev/frontend/hooks/useSyncController.ts` | One reconciler for playback intent, generation cancellation, canonical track identity, scheduled starts, crossfade and emergency correction |
| `dev/syncbeats-server/src/core/Room.ts` and `RoomQueue.ts` | Shared timeline, readiness gate, queue/shuffle/repeat, playback instance identity, and server-owned advancement |
| `dev/syncbeats-server/src/handlers/SocketHandler.ts` | Existing Socket.IO protocol, approval flow, clock responder, and cloud file-sharing relays |
| `dev/syncbeats-server/src/handlers/RoomRoutes.ts` | Default-room creation/reuse, room retrieval, uploads/enqueue, and audio proxy/cache routes |
| `dev/syncbeats-server/src/handlers/MusicBridgeRoutes.ts` | Metadata-to-playable-track matching through `/api/bridge/resolve` |
| `dev/frontend/docs/brand.md` | Linked Play logo; charcoal `#171C1A`, off-white `#F4F5EF`, silver `#B7BAB5`; color comes from artwork |

The web bug tracker remains active in [implementation_plan.md](../../implementation_plan.md). Native playback must protect the same regressions: adding a queue item must not restart the current track, reconnect must restore authoritative state, and completion must advance only once per playback instance.

## Desktop experience

### One room workspace

After sign-in, enter the user's room directly. Use the existing idempotent `POST /rooms/default` endpoint to create or reuse the owned room. `GET /rooms/mine` returns lists of owned and invited rooms; it does not promise a single permanent room. Let the user join another room by code, QR invite, or a nearby paired Mac without forcing a separate hub screen.

The main window has four areas:

1. A narrow source rail for the room, Apple Music library, playlists, local files, and recent tracks. A command palette searches songs, rooms, and actions.
2. A central stage with large artwork, title/artist, restrained artwork-driven lighting, and an optional audio-reactive visualizer. Lyrics replace part of the stage when selected.
3. A resizable right pane switching between the queue and devices. Queue entries show match/download status, support drag reorder and multi-selection, and remain visible while browsing the library.
4. A persistent transport bar with play/pause/seek/next, shuffle/repeat, local volume, and output selection. Controls reflect confirmed room state; pending commands have a clear visual state.

### Distinctive interactions

- Devices appear as a spatial room map with recognizable output/device names, volume, readiness, and actual connection status. Switching to a list keeps large rooms usable. Spatial routing is a later feature, not implied by the map.
- Library browsing uses artwork grids and compact track rows. Drag songs/playlists into the queue; show matching progress and explain unresolved songs inline.
- Cloud, nearby relay, reconnecting, offline session, and buffering have distinct readable states. Display measured sync quality only after real samples exist; never invent latency values.
- Use SwiftUI for the window and state-driven UI, with AppKit for menu-bar behavior, window management, and native file interactions. Prototype visualizer rendering with SwiftUI Canvas; use Metal only if profiling justifies it.
- Support keyboard shortcuts, VoiceOver labels, reduced motion, high contrast, and window resizing. At narrow widths, drawers replace side panes; transport controls remain available.
- A menu-bar mini-player and optional floating compact player come after the main workspace. The previous notch/Dynamic Island implementation is not a dependency or the main navigation pattern.

The [studio visual prototype](swift-desktop-concept.html) and [three-direction comparison](swift-desktop-directions.html) are layout proposals with sample data, not implemented Swift apps or observed live rooms. The comparison includes controls to preview both music modes.

Standalone HTML boilerplates are available for [music studio](01-studio.html), [dark visualizer](02-dark-visualizer.html), and [light gallery](03-light-gallery.html). Each includes inline styles/scripts and can be opened directly without a build step.

### Selected appearance: studio dark, gallery light

The [premium paired preview](premium-desktop.html) is the current visual reference. The first and third standalone examples have been updated to match it; the original three-direction comparison remains a record of exploration.

- Dark: deep charcoal and warm green-black surfaces, large artwork, the existing source rail and queue/device pane, and a softly lit central stage.
- Light: warm ivory, the existing editorial heading and artwork/library/device panels, champagne surfaces, and quieter shadows.
- Gold is an accent: brushed gold `#CCB184` on dark controls and selected details; darker bronze `#8A6C3C`/`#856635` on light controls for contrast. Avoid bright yellow, large metallic text, or gold on every border.
- Match typography, corner radii, controls, commands, track identity, and playback state across appearances. Keep the chosen layouts rather than introducing a fourth composition. Theme switching must preserve the current room and playback state.
- Use fine separators, restrained highlights, and dimensional artwork to support the premium appearance. Album colors remain allowed; gold does not replace the Linked Play logo or change the preserved app assets.
- Verify final text/icon contrast and VoiceOver/reduced-motion behavior when translating the prototype to SwiftUI. These HTML files illustrate visual direction, not production accessibility certification.

### First launch, introduction, and account access

The [first-launch HTML prototype](first-launch.html) is the current reference for the signed-out entry flow. It uses the preserved Linked Play mark and selected gold/ivory/charcoal design language.

1. Show a brief brand animation (about 2.3 seconds in the prototype), with a skip action. Honor reduced motion and avoid using a fake loading indicator. In the native app, initialization must run independently of animation.
2. On first use, show three short cards explaining one shared room, library matching versus direct Apple Music, and nearby/cloud listening. Support back/next, card selection, and jumping directly to login.
3. Follow with login and signup in the same visual shell. Keep email/password and Google sign-in aligned with existing `/auth/login`, `/auth/register`, and `/auth/google` capabilities. Validate signup passwords against the current minimum of eight characters; use existing verification and reset endpoints when wiring the real app.
4. The HTML forms are local visual previews: no requests, no credential persistence, no account creation, and no email. Signup demonstrates email verification; login, reset, and Google actions clearly report preview-only results.
5. Request Apple Music authorization when the user connects or opens their library, after account access. Keep direct-playback subscription requirements visible in context; do not add unsupported Apple sign-in or request music/Bluetooth/microphone permissions on the intro cards.
6. In Swift, remember completed introduction separately from authentication. Returning authenticated users proceed to their room; signed-out returning users see account access. Theme changes must not restart onboarding or interrupt form entry. Store real session credentials in Keychain, never in onboarding preferences.

The approved HTML entry flow has now been translated into native SwiftUI. It uses the existing auth endpoints, Keychain storage, explicit verification/reset states, retryable session recovery, and default-room retrieval. The launch logo/title/caption are centered together; intro content centers vertically and remains side by side at Mac window widths. The default window is 960 × 720, and short windows scroll rather than clip controls.

Responsive refinement: a shared `EntryLayout` expands the composition using both available width and height. The account panel grows from a compact 1080-point cap toward 1480 in spacious windows, with proportional typography, controls, spacing, and story/form widths. Below 660 usable points the columns stack. Intro heading size, artwork height, margins, and navigation use the same policy. Native offscreen artifacts verify content positions at compact and full-screen sizes; keyboard, scroll interaction, and live-window review remain manual.

Verification: Debug macOS build passed; 30 production-client/model checks passed against the local stand-in, including a real Keychain roundtrip. Frontend typecheck and association-route lint passed. Native app launch and introduction controls were observed through accessibility, but full rendered light/dark/resize/keyboard/reduced-motion review remains manual because image capture was not usable in this session. Live email/account flows and a live room response have not been verified.

Google sign-in now uses the existing Google web OAuth client and website redirect, followed by a `syncbeats://google/callback` handoff. The backend verifies Google's token and request nonce, stores only a hashed short-lived code bound to a PKCE challenge, and issues the native session after a one-time exchange. Debug and Release no longer require Associated Domains or a paid Apple Developer team. The native Google migration and updated backend/website must be deployed before live testing.

## Apple Music library and audio sources

### Shared playback path

1. Ask for MusicKit authorization when the user opens the library or explicitly connects it. Denial does not prevent room playback or local file import.
2. Read songs and playlists with pagination, cancellation, bounded artwork loading, and an explicit refresh action. Retain title, artist, album, duration, identifiers, and artwork references as available.
3. Resolve a selection through the existing `/api/bridge/resolve`, then enqueue its returned playable identity through the current room API. Use supported server matching first; do not rebuild a client-side scraper by default.
4. Treat MusicKit IDs as metadata identifiers, not server `Song` or `PlaylistTrack` IDs. Only send `songId`/`trackId` when they refer to actual backend records. Extend the API explicitly if Apple catalog IDs/ISRC are needed for matching.
5. Preserve the original library attribution while clearly showing the actual shared audio source. Expose unavailable and ambiguous matches; an incorrect recording must not silently stand in for the requested song.
6. All participating clients must use the same recording and compatible timeline, including intro length, decoder priming, and duration. Different versions of the same song cannot be synchronized by title alone.

MusicKit subscription playback does not provide protected audio buffers to `AVAudioEngine`. A matched stream is a different source from the Apple Music recording. Both paths are in scope, with separately measured synchronization limits and explicit participant capability checks.

### Direct Apple Music playback — confirmed scope

1. Use a native MusicKit player adapter for the actual Apple Music recording. Check authorization, subscription playback capability, catalog/storefront availability, and identity for every participating client.
2. Start with direct playback between supported native Macs. Browser support requires its own MusicKit JS/auth/playback feasibility work; existing browser clients do not acquire this capability merely by joining a room.
3. Resolve library items to a playable catalog identity where possible. Library-only uploads and unavailable storefront variants need an explicit unavailable state, rather than assuming another subscriber can access the same file.
4. Keep playback mode room-wide: `shared-audio` or `apple-music`. Everyone in a session follows the same recording and compatible timeline. Do not silently use a matched YouTube recording for one listener while others play the Apple Music master.
5. Extend the backend contract with playback mode, source identity/catalog metadata, device capabilities, and a compatible join policy. Existing clients default to shared-audio; a direct-mode join explains any unsupported client or missing subscription and offers a deliberate room-mode switch.
6. Switching modes cancels old schedules, validates all required participants, re-prepares audio, and creates a new readiness/playback instance boundary. Keep queue items typed by source; a cross-mode item requires an explicit resolved identity before playback.
7. Reuse clock estimation and authoritative room intent, but give MusicKit a separate reconciliation strategy. Its player API does not expose the `AVAudioPlayerNode` sample/host-time scheduling path; measure command latency, position reporting, seek granularity, buffering, and recovery before defining a sync target.
8. Run an early two-Mac feasibility spike for scheduled intent, pause/resume, seek, late join, skip/repeat, sleep/wake, and cloud/LAN route changes. Record achieved audible skew and interruptions. If accuracy is insufficient, present direct mode as subscription listening with its measured limits and let the user explicitly switch the whole room to shared-audio for tighter sync.
9. A LAN relay may relay direct-mode state and clock estimates, but each subscriber retrieves protected content through MusicKit. Do not cache or relay decrypted Apple Music audio through the native file server.
10. Scope direct-mode output controls to supported MusicKit/system capabilities. Do not promise protected-audio EQ, spectrum taps, arbitrary device routing, or independent multi-output clocks. Use an ambient visualizer in direct mode unless a supported analysis path is established.

Library actions should distinguish **Add shared version** and **Play Apple Music recording**, with subscription/availability states shown in context. Internal clock/codec details stay in diagnostics, not the normal library flow.

### Native renderer and cache

- Download supported, non-protected room audio to a bounded on-disk cache, open it with `AVAudioFile`, and schedule `AVAudioPlayerNode` against host time. Use render/sample time for position, rather than UI timers.
- Confirm the backend serves AAC/M4A or another Core Audio-supported format. Its current proxy routes alone do not establish a compatible format. Where yt-dlp supplies native audio, require `bestaudio[ext=m4a]`; do not pass WebM/Opus to `AVAudioFile`.
- Use `URLSession` download tasks or `data(for:)` with bounds; avoid per-byte asynchronous iteration. Write atomically, validate MIME/container/duration, deduplicate downloads, and cancel superseded requests.
- Cache by canonical source identity plus actual asset version/hash. Replacing a transport URL or updating artwork must not restart the same track. Set disk limits and LRU eviction; protect the current/next asset.
- Prepare the current track and the server-selected successor. Report `room:clientReady` only after decoding/preparation succeeds; provide retry/error states rather than reporting false readiness.
- Begin with one selected Mac output. Output latency compensation, manual calibration, and route-change recovery follow. Bluetooth adds variable buffering; low network RTT does not establish low audible skew.
- Multi-output routing is a separate Core Audio milestone requiring independent output clock/latency handling. BLE is useful for discovery, not as the audio synchronization transport.

## Synchronization model

### Shared rules

The cloud Room remains authoritative while connected: clients submit commands and reconcile snapshots; every participant retains play/pause/seek access. Host-only management permissions stay unchanged. Keep the backend Room independent of transport.

Reuse existing `queueVersion` and `playbackInstanceId`, but do not mistake a queue version for a version of every room mutation. Add an explicit state revision/session incarnation only where relay ordering requires it, through a compatible protocol change. One native reducer applies snapshots and events; stale events, downloads, and scheduled starts are rejected by generation and identity.

Keep units explicit: wire epochs/offsets are milliseconds, media positions are seconds, and Core Audio host/sample times require explicit conversion. Map a stable epoch anchor onto monotonic host time; re-anchor after sleep or clock discontinuity.

### Clock and drift parity

Port the current four-timestamp formula:

```text
offsetMs = ((t1 - t0) + (t2 - t3)) / 2
rttMs    = (t3 - t0) - (t2 - t1)
serverNow = epochAnchor + monotonicElapsed + offsetMs
positionSeconds = (serverNow - startEpoch) / 1000
actualStartEpoch = startEpoch + pauseOffsetSeconds * 1000
```

Reject malformed, stale, and high-RTT samples; port the current IQR/lowest-RTT filtering and median logic. A failed burst does not count as a fresh clock. Current adaptive starting values are:

| Tier | Samples | RTT gate | Probe gap | Resync interval | Drift check | Correction threshold |
|---|---:|---:|---:|---:|---:|---:|
| Excellent | 7 | 150 ms | 20 ms | 10 s | 250 ms | 20 ms |
| Good | 7 | 250 ms | 40 ms | 12 s | 350 ms | 25 ms |
| Fair | 5 | 400 ms | 60 ms | 15 s | 600 ms | 35 ms |
| Poor | 4 | 600 ms | 100 ms | 20 s | 1 s | 50 ms |

Match current tier classification and EWMA alpha `0.35`. Keep playback rate at `1.0`. The current web controller uses 30 ms fade-out/fade-in for moderate drift and an emergency correction above `max(correctAt + 180 ms, correctAt * 4)`; verify the native equivalent audibly before changing tuning. Never correct against a future start while the source is waiting for its scheduled host time.

The readiness gate schedules playback roughly 800 ms ahead after clients are ready. Same-track resume checks existing readiness first. On reconnect, apply the fresh snapshot and re-declare readiness immediately when the current file is already prepared. Cancel obsolete host-time schedules on pause, seek, track change, disconnect, and authority changes; deduplicate completion per playback instance.

### Hybrid modes and authority

| Mode | Room authority | Clock/media path | Behavior |
|---|---|---|---|
| Cloud | Existing cloud server | Direct cloud NTP and audio/cache | First milestone: Mac and existing web clients share one room |
| Cloud + LAN relay | Existing cloud server | A paired Mac relays authoritative events, its cloud-clock estimate, and identical cached media to nearby native clients | Commands are forwarded to the cloud; no optimistic local queue or playback changes |
| Offline LAN session | Explicitly chosen local coordinator | Local clock, local state, and already available/local audio | Separate session; remote cloud participants cannot remain synchronized to it |

For a relayed clock, compose the measured peer-to-Mac offset with the Mac-to-cloud offset, propagate uncertainty/freshness, and compare with the direct route when available. Prefer the reliable route using sustained measurements and hysteresis, rather than switching on one fast ping. Keep both paths in the same cloud epoch domain while online.

Use Bonjour (`_syncbeats._tcp`) for discovery and Network.framework for native peer connections. Socket.IO remains the cloud transport. The native LAN endpoint needs its own versioned, authenticated HTTP/WebSocket contract; a raw WebSocket endpoint is not automatically Socket.IO-compatible. Pair with a short-lived invitation bound to a room and device identity, then pin the peer identity. Discovery alone grants no room access.

The relay must enforce private-room approvals, bounded messages/connections, and authorized byte-range cache access. Preserve existing HTTP 206 behavior. Do not advertise reusable cloud tokens or serve arbitrary disk paths over LAN.

Initially, browser clients continue using the cloud. Secure LAN discovery/transport for browsers is a later compatibility milestone because HTTPS mixed-content rules, certificate trust, and local-network permissions need an actual supported flow. Do not claim the Mac can transparently relay to all existing web clients without frontend/backend work.

### Disconnect, failover, and reconciliation

- Relay loss while the cloud is reachable: discard relay schedules, apply a fresh cloud snapshot, remeasure clock quality, then resume from the authoritative timeline.
- Cloud loss: show reconnecting/degraded status. Do not silently create a second authority. Offer an explicit offline LAN session using cached/local media; search, uncached streams, and global edits are unavailable.
- Coordinator loss in an offline session: pause and offer explicit coordinator recovery in the initial version. Automatic leader election requires an epoch/lease protocol and is a later milestone.
- Cloud recovery from an offline session: offer rejoining the cloud room or deliberately importing the offline queue as a new action. Never blindly replay old offline commands into the live room. Change timelines through a fresh readiness/scheduling boundary.
- Mac sleep/wake and output-device changes: invalidate stale clock confidence and pending schedules, refresh room state, prepare output, and rejoin playback. Record why recovery occurred.

## Proposed code structure

Inside `Syncbeats(apple)/Syncbeats/Syncbeats/`, retain the existing asset locations and organize new source as:

```text
App/                 Entry point, dependency composition, windows, menu bar
Domain/              Typed room/queue/device models, commands, state reducer
Features/            Workspace, library, devices, authentication, settings
DesignSystem/        Brand tokens, typography, reusable controls, motion
Infrastructure/      HTTP API, cloud Socket.IO, Keychain, persistence
Audio/               Renderer, bounded cache, prefetch, output routing
Sync/                Clock estimator, adaptive policy, timeline reconciliation
LocalNetwork/        Discovery, pairing, relay, offline session coordinator
```

Use actors for network/cache orchestration and main-actor isolation for view state. Audio callbacks must avoid allocation, locks, networking, and main-actor hops. Explicitly audit the preserved project's default `MainActor` isolation when introducing audio/clock code. Keep the renderer, clock, room reducer, and transports separately replaceable for meaningful tests.

## Delivery sequence and acceptance

| Milestone | Deliverable | Evidence required before continuing |
|---|---|---|
| 1. UI and app shell | New entry point, studio layout, source rail, queue/device panes, design tokens, sign-in/session restoration | macOS build; resized/light/dark/reduced-motion/keyboard review; real room retrieval; configuration changes explicitly recorded |
| 2. Cloud room parity | Typed commands/events, one reducer, queue and device management | Mac and two browser tabs see the same queue; pause/seek/reorder and private approval work; reconnect restores state |
| 3. Native audio and sync | Supported audio path, cache/prefetch, host-time renderer, NTP/adaptive controller | Same recording on Mac + web; readiness, repeat, duplicate ended, mid-track join, output change, sleep/wake, and queue-add regression checks pass |
| 4. Apple Music library | Permission states, paginated library/playlists, matching/enqueue, progress | Real authorized/denied/empty/large libraries; unavailable/ambiguous matches; playlist cancellation; no silent wrong-version substitution |
| 5. Direct Apple Music | MusicKit player adapter, subscription/catalog capability checks, typed room mode, distinct sync strategy | Two real subscribing Macs; measured skew/seek/late-join/recovery; unsupported joins and mode switches are clear; no mixed recordings or protected audio relay |
| 6. Online LAN relay | Discovery, authenticated pairing, media relay, route selection for both music modes | Two Macs share one cloud authority; relay loss falls back; bad/stale clocks are rejected; private rooms and unauthorized requests stay protected |
| 7. Offline LAN | Explicit session creation and recovery/import flow | Cloud loss/recovery and coordinator loss cannot split one room or replay stale commands; shared cached/local files work without internet; direct-mode offline availability follows MusicKit capabilities |
| 8. Desktop polish and distribution | Menu-bar player, optional compact window, measured visualizer, optional multi-output proof of concept, signed app | CPU/energy/accessibility review; real Bluetooth/wired outputs; clean-machine signing/notarization/install/update checks |

Start library API and direct MusicKit synchronization feasibility during milestone 1, even though finished music integration follows shared native audio. Prototype the UI with fixture data clearly marked as such, then replace it with real room state in milestone 2.

For core sync, use deterministic clock/timeline tests and shared JSON fixtures with the web implementation. Cover outliers, clock jumps, reordered events, stale generations, duplicate completions, and transport changes. UI polish does not require tests that merely mirror view markup.

Measure audible inter-device skew with recordings/loopback on actual hardware. Report p50/p95/max, startup convergence, network conditions, output latency, and interruptions. The `<25 ms` goal is a target under defined conditions, not a blanket guarantee for browser throttling, Bluetooth, or MusicKit subscription playback. Do not declare LAN sync complete from RTT telemetry alone.

## Decisions for the next planning pass

1. The visual choice is confirmed: studio dark mode and gallery light mode, preserving both layouts with premium gold accents. Translate the paired preview into shared SwiftUI components and theme tokens.
2. Both matching and direct Apple Music playback are confirmed. Validate the direct player's synchronization limits in the early feasibility spike.
3. Choose the supported shipping macOS minimum when starting the shell; preserved configuration is currently `26.6`.
4. Begin with one output and two-Mac LAN relay; prioritize multi-output or browser LAN support only after measured core playback is reliable.

The account flow now opens the native studio/gallery room directly, with typed Socket.IO snapshots, queue/search/device views, and server-authoritative playback commands. The notch companion shares this session, reserves the physical camera area, and supports compact/expanded/pinned modes plus non-notched screens. A live localhost session restored into the real room and displayed its current track; auth fault handling passed the local simulation. Next, implement supported audio and clock synchronization. Until then, this Mac is explicitly a room controller and uses the server's blocked-player state to stay out of the audio-readiness gate. No production deployment or backend behavior change was made.
