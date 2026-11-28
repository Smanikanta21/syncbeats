# Native hybrid sync — November 23, 2026

Implemented in the `macos-dev` working tree for macOS, iOS and iPadOS. This is source and local verification evidence; the live backend has not been deployed by this task.

## Behavior

- The cloud remains the only room/queue/playback authority. Local transport does not invent a second playback timeline or allow an offline room takeover.
- Native clients request `hybrid:join` after their room snapshot confirms membership. The backend sends a ten-minute, random room TLS credential only to actual room participants, renews it before expiry, and rotates it when a participant leaves. A kicked socket is excluded from the new credential.
- Bonjour discovers same-room Apple peers. The advertised name contains a random session tag, never the room code, JWT or signing secret. Local numeric addresses in TXT provide a path around slow service-address resolution; public addresses and hostnames are rejected by that fast path. Native defaults advertise private physical-interface addresses, not loopback.
- Audio comes from the existing owned disk cache. Peers announce up to two cached track keys, and the receiver selects one cached seeder, preferring the Mac when cache availability is equal. Downloads are coalesced between prefetch and playback. A peer miss or failure falls back to the existing HTTP download.
- Transport uses TLS 1.2 PSK with AES-128-GCM, SHA-256 file verification, 64 KiB blocks, a 60 MB peer-file limit, two concurrent outgoing files and eight concurrent channels. The existing two-file/80 MB disk-cache bound and active-reader ownership are preserved. File transfer has a four-second idle deadline and a 45-second transfer limit; cancellation closes the connection and removes incomplete files.
- A local path qualifies after two successful probes, RTT below 100 ms and jitter below 40 ms. Two failures apply a 30-second cooldown. Discovery performs an initial short probe burst; established health probes run every eight seconds.
- The selected Mac can share its direct-cloud clock estimate only while it is fresh. Other devices use that authenticated local estimate while fresh, and return to their own cloud estimate when it expires. Relayed clocks are never chained through other relayed clocks.
- Native clock reports reuse `sync:stats` and its one-way latency units. The backend converts to RTT and gives all devices a common future start/seek lead: at least 150 ms, at most 1.5 seconds, scaled with measured RTT and jitter. Stale or departed-device reports do not add delay.
- Backgrounding iOS/iPadOS stops Bonjour/Bluetooth discovery and local serving, preserving owned prepared audio and the HTTP path. Foregrounding restores discovery. No display wake lock is introduced.

## Nearby detection

The Devices panel shows local connection availability and an optional **Nearby hints** switch. Wi-Fi/Bonjour establishes local reachability, not physical distance. Bluetooth advertises session-specific peer identifiers and smooths RSSI; it labels a device nearby only after sufficient strong samples, uses hysteresis for weaker readings, and expires old observations. It never displays invented meters or uses RSSI to select the audio path.

Bluetooth is off by default. With permission and Bluetooth enabled, foreground scans run for three seconds every fifteen seconds. Permission denial, unsupported advertising or Bluetooth being off does not prevent cloud playback.

## Verification

- macOS Release build: passed, `/tmp/syncbeats-hybrid-2026-11-23/build-macos/Build/Products/Release/Syncbeats.app`.
- Universal iOS Release build: passed, `/tmp/syncbeats-hybrid-2026-11-23/build-ios/Build/Products/Release-iphoneos/Syncbeats.app`.
- Both built Info.plists contain `_syncbeats._tcp` as a Bonjour-service array and the local-network/Bluetooth usage descriptions. iOS retains only the existing `audio` background mode.
- 39 hybrid checks passed: real TLS connections, wrong-key rejection, malformed/oversized frames, checksum rejection, truncated transfer, cancellation, timeout, cache coalescing/ownership, HTTP fallback, production Bonjour discovery with loopback addresses, production relay transfer, single-seeder inventory, Mac clock sharing, non-member rejection and background shutdown. Clock-source checks reject phones and generic laptops with Mac in the user name, honor explicit mobile metadata, and preserve native Mac output and legacy suffix compatibility.
- 93 existing native audio checks passed against the existing Postman synthetic-audio simulation and real local Socket.IO/Room fixture, covering readiness, rendering, pause/resume, seek, recovery, cancellation and authority.
- Backend tests and TypeScript build passed, including credential isolation/renewal/revocation, non-member rejection, request throttling and adaptive playback scheduling.
- Only the macOS build exports clock estimates. Discovery callbacks ignore earlier network generations; hybrid source builds without Swift concurrency warnings. The existing audio engine still has three Swift 6 migration warnings under the project's Swift 5 build mode.
- The older `run-room-checks.py` runner cannot compile its obsolete fullscreen assertions: `playerPresentationOptions` and `FullScreenPlayerWindow` were removed, and `show(room:)` now requires `light:`. This runner was not counted as passing; the 93 audio/Socket.IO checks above use the current production source. The current player uses a standard resizable macOS window with native fullscreen.

Hybrid evidence is in `/tmp/syncbeats-hybrid-checks.log`; playback evidence is in `/tmp/syncbeats-hybrid-audio-regression.log`; simulated HTTP requests are in `/tmp/syncbeats-hybrid-sim.ndjson`. The existing repository mock supplied synthetic audio; no real YouTube or Apple service was mocked as a room authority.

## Remaining device verification

### November 25 deployment diagnosis

The user confirmed both devices have the hybrid build, share Wi-Fi and have Nearby hints enabled. A read-only check of the latest successful main deployment identified commit `d33824476a184521590270a2585ec734c1434b32`, workflow run `45336944710`, completed November 24. The Build & Deploy to VM job succeeded. `SocketHandler.ts` at that exact commit contains neither the `HybridRelay` import/registration nor a `hybrid:join` handler; `HybridRelay.ts` is absent at that commit. This deployed revision cannot provide the native local-discovery credential. Deploying the prepared backend changes is required before expecting peer discovery from these builds. No deployment was triggered by this diagnosis.

The production `/health` endpoint returned `{"status":"ok","rooms":2}`; a temporary read-only WebSocket probe connected and received `sync:pong`. The probe did not join any room or request a valid room credential. Its unanswered invalid `hybrid:join` is not capability evidence because the implemented handler also ignores non-member requests. The deployment conclusion comes from the exact successfully deployed source revision, not that probe. Out-of-band deployments were not audited. Workflow: https://github.com/Smanikanta21/syncbeats/actions/runs/45336944710.

### November 25 status correction

The Bluetooth label previously used "Waiting for another room device" for both an empty room and a missing server-issued session. It now distinguishes hints being disabled, no other room member, and missing server authorization. The main connection label also identifies missing authorization when another member is present. Expired credentials are withheld from Bluetooth discovery. This is a status correction, not evidence of a new physical connection or backend deployment.

macOS and generic iOS Release builds passed, and 43 hybrid checks passed, including the four added status assertions. Logs: `/tmp/syncbeats-hybrid-status-2026-11-25-checks.log`, `/tmp/syncbeats-hybrid-status-2026-11-25-macos.log`, `/tmp/syncbeats-hybrid-status-2026-11-25-ios.log`. The previous 93 audio checks were not rerun for this status-only change. These updated builds were not installed on physical devices by this follow-up; the live backend's current hybrid deployment status was not verified.

Loopback verification exercises the production discovery, authentication, transfer and clock code with injected test addresses. Physical-interface attempts on this Mac timed out; an ad-hoc verification bundle also reported discovery unavailable, and its permission UI could not be inspected. These attempts do not establish cross-device LAN operation.

After deploying the backend changes and installing the new app builds, allow **Local Network**, join the same room on a Mac and phone/tablet, and verify a local cache transfer, clock freshness and fallback after leaving Wi-Fi or backgrounding. Enable **Nearby hints** on both devices to check actual BLE advertisements and RSSI behavior. Locked-screen audible timing, Bluetooth distance accuracy, IPv6-only/peer-Wi-Fi operation and physical-device energy use remain unverified.

This first hybrid path carries audio and clock probes locally; room commands still require the cloud connection. It does not implement a standalone offline edge server, TURN service, browser LAN receiver or Bluetooth audio-file transport. No paid relay infrastructure was added.
