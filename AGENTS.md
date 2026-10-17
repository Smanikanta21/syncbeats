# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**SyncBeats** is a full-stack app for synchronized music playback across multiple devices (< 25ms target) using NTP-style clock offset estimation plus drift correction. Live at syncbeats.in. Monorepo layout:

- `dev/frontend/` — Next.js 16 (React 19, Tailwind 4) web client
- `dev/syncbeats-server/` — Express 5 + Socket.IO 4 + Prisma 7 (PostgreSQL) backend
- `dev/syncbeats-desktop/` — (Planned) Electron wrapper for Desktop (Windows/Mac) with Local Edge Node LAN server and multi-audio output routing.
- `dev/db-visualizer/` — custom Next.js database-inspection app (its own Prisma client, not Prisma Studio)
- `Syncbeats(apple)/` — Native Swift macOS/iOS App. Features: **Hybrid Cloud/LAN Relay** (acts as a local edge node while maintaining global sync), **Proximity Scanner** (Bonjour/BLE for instant local pairing), **AVAudioEngine** playback (download-first for millisecond-perfect sample scheduling), **MusicKit Integration** (native Apple Music library queueing), and high-speed prefetching. Uses a minimalist, colorless native SwiftUI component design (no Hub, direct Room entry).
- `Syncbeats Android/` — Kotlin Android app
- `docs/SYSTEM_DESIGN_DIAGRAMS.md` — architecture diagrams

## Commands

### Backend (`dev/syncbeats-server`)

```bash
npm run dev               # ts-node-dev on :4000 (auto-reload)
npm run build             # tsc → dist/
npm run start             # node dist/server.js
npm run prisma:generate   # Regenerate Prisma client
npm run prisma:migrate    # prisma migrate dev (creates migration file)
npm run prisma:push       # prisma db push (dev only, no migration file)
npm run prisma:seed       # ts-node prisma/seed.ts
```

Prisma 7: datasource URL comes from `prisma.config.ts` (reads `DATABASE_URL` via dotenv), not from the schema file.

### Frontend (`dev/frontend`)

```bash
npm run dev     # Next dev server on :3000
npm run build   # Production build
npm run lint    # ESLint
```

### Docker

```bash
# Local dev dependencies only: postgres on host port 5439 + db-visualizer on :5555
docker compose -f docker-compose.dev.yml up
# Note: docker-compose.dev.yml is a standalone dev stack, NOT an override file.

# Production stack (GHCR images): postgres, server, frontend, visualizer
docker compose up -d
```

### Testing

**No test suite exists.** Verify changes manually: run both dev servers, create/join a room from two browser tabs (or devices), and watch Socket.IO events in DevTools and server logs. `GET /health` reports live room count.

## Environment

Single `.env` at the repo root (backend loads it via `dotenv/config`; docker compose interpolates it). Key vars: `DATABASE_URL`, `PORT` (4000), `JWT_SECRET`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, `RESEND_API_KEY`, `AUTH_FROM_EMAIL`, `FRONTEND_URL`, `NEXT_PUBLIC_SERVER_URL`, `SPOTIFY_CLIENT_ID`/`SPOTIFY_CLIENT_SECRET`, `RAPID_API_KEY(S)`, optional `REDIS_URL` (enables the Socket.IO Redis adapter for multi-instance scaling), AWS S3/CloudFront vars.

## Architecture

### Server: Room state machine (`src/core/Room.ts`)

`Room` extends `EventEmitter` and is a **pure state object** — it knows nothing about sockets. `RoomManager` is a singleton registry of live rooms. `SocketHandler` wires socket events to Room methods; Room emits events (`stateChanged`, `schedule`, `pause`, …) that the handler broadcasts to the Socket.IO room.

Key Room behaviors:
- **No host gate for playback** — any participant can play/pause/seek (some room-management actions like private-mode toggle and join approval are host-only).
- **Readiness gate**: `play()` is deferred (`pendingPlay`) until all clients report `room:clientReady`; the server then schedules playback ~800ms in the future via a shared `startEpoch`.
- **Timeline model**: playback position is derived from `{startEpoch, pauseOffset, isPlaying}` — clients compute `expected = (serverNow - startEpoch) / 1000`.
- Queue (drag-reorder, shuffle, repeat modes), per-participant volume, spatial positions.

**Persistence**: the database is the source of truth; Room state is transient and hydrated from Prisma (`db/RoomRepository.ts`) on room creation/join. Stale rooms (60 days without access, no participants) are cleaned up hourly along with their uploaded files.

### Clock sync — there is no server-side SyncEngine

The server side of NTP sync is just the `sync:ping` → `sync:pong` responder in `SocketHandler.ts` (returns `{t0, t1, t2, seq}`). All the real sync logic is client-side:

- `hooks/useRoom.ts` — NTP burst on join (offset = `t1 - (t0+t3)/2`, RTT-gated, median of filtered samples), self-rescheduling resync loop, and the drift-correction interval. Drift beyond the hard-seek threshold triggers a **WebAudio crossfade seek** (50ms fade out → seek → fade in); below the threshold playback rate stays at exactly 1.0 (pitch-perfect — the old ±rate-adjustment approach was removed).
- `hooks/useAdaptiveSync.ts` — classifies network quality (excellent/good/fair/poor) from RTT samples and EWMA-blends all 7 NTP/drift parameters per device (sample count, RTT gate, resync interval, hard-seek threshold, etc.). Read the `PARAM_TABLE` there before changing any sync tuning.
- `hooks/useNetworkStats.ts` — independent latency/jitter measurement for the UI.

Clients can also drive scheduling directly via `playback:schedule` → `Room.syncSchedule()`.

### Socket.IO events

Client → server: `room:join/leave/clientReady`, `playback:play/pause/seek/ended/next/prev/jumpTo/schedule/blocked`, `sync:ping`, `room:toggleShuffle/toggleRepeat/togglePrivate`, `room:approveJoin/denyJoin` (private rooms), `room:setParticipantVolume`, `device:register/ping`.
Server → client: `room:snapshot` (on join), `room:stateChanged` (every mutation), `sync:pong`, `room:joinPendingApproval`, `error`.

Clients do **not** apply playback changes optimistically — commands round-trip through the server and come back as state snapshots.

### REST routes (`src/handlers/`, registered in `server.ts`)

`/auth` (JWT + Google OAuth + email verification/reset via Resend), `/users`, `/rooms` (create/list/upload/queue), `/devices` (trusted devices), `/search`, `/youtube`, `/spotify`, `/history`, `/api/playlists`, `/api/bridge` (MusicBridge). Music sourcing uses yt-dlp/ytdl/play-dl and Spotify metadata — these handlers are large and external-API heavy.

**Audio serving**: uploaded files are served from `uploads/` by a hand-rolled `/files/:filename` route in `server.ts` that implements HTTP 206 byte-range streaming — `express.static` was insufficient (browsers need partial content for seeking, and multiple devices buffering at once stalled without it). Don't replace it with `express.static`.

### Native Swift App (macOS/iOS)

The native Apple ecosystem client (`Syncbeats(apple)/`) is an active work-in-progress, replacing the electron app strategy with native system capabilities. 

Key architectural components include:
- **No Hub UI (Edge Node Model)**: The app entirely skips the traditional "Room Hub" discovery process. Upon successful login (`AuthManager`), it queries `GET /rooms/mine` to fetch the user's permanent, unique 6-digit room, or gracefully calls `POST /rooms` to instantly create one. It immediately drops the user into their `RoomView` acting as a persistent Edge Node.
- **MusicKit Integration (`MusicLibraryService`)**: Directly accesses the user's local Apple Music library via `MusicKit`. Imported tracks bypass file uploads—when clicked in the UI, they trigger a backend API request to `MusicBridge` (`/api/bridge/resolve`), which maps the Apple track to its YouTube/streaming equivalent, then natively calls the `enqueue-youtube` route.
- **Socket.IO (`RoomManager`)**: Built on `socket.io-client-swift`. Manages room queue synchronization by interpreting the JSON payload from `room:snapshot` and `room:queueChanged`. Currently acts purely as a robust queueing remote control for other connected clients.
- **AudioEngine (NOT STARTED)**: The most critical pending feature. Requires a native `AVAudioEngine` implementation for audio rendering, combined with a Swift translation of the frontend NTP Drift Correction algorithms to guarantee millisecond-perfect multi-device synced playback.

### Desktop Electron App (Local Edge Node) - *Planned*

The desktop application (`dev/syncbeats-desktop`) wraps the Next.js frontend using Electron to provide native capabilities:
- **Local Edge Node Server:** Runs a lightweight, in-memory version of `syncbeats-server` locally (`localhost:4000`) for zero-latency LAN parties without requiring internet access.
- **Hybrid Cloud Bridge:** Can relay cloud state from `syncbeats.in` to local LAN clients.
- **Speaker Decks (Multi-Audio Routing):** Uses `navigator.mediaDevices.enumerateDevices()` and Web Audio API's `setSinkId()` to map individual audio channels to specific Bluetooth speakers (e.g., Sony, Marshall) bypassing browser permission prompts via Electron's `session.setPermissionRequestHandler`.
- **Uncapped Framerate:** Disables Chromium's frame rate limit to run WebGL visualizers at native monitor refresh rates (e.g., 120FPS+).
- **UI Architecture:** Skips marketing landing pages and jumps directly to a desktop-optimized Hub and Room UI while reusing core React components via a `window.isElectron` environment flag.

### Frontend structure

- `app/(session)/` — authenticated routes: `hub/` (room list + QR scanner), `room/[id]/` (main playback UI), `profile/`
- `lib/socket.ts` — Socket.IO client **singleton** (`getSocket()`), `autoConnect: false`, websocket-only; when the API base is `/api` it routes through `/api/socket.io`
- `context/` — AudioContext, AuthContext, SyncContext, UploadContext, VisualizerContext, ThemeProvider
- Other hooks: `useAudioPlayer` (HTMLAudioElement + WebAudio gain node), `useSpatialAudio`, `useTrackPrefetcher`, `useWakeLock`, `useAmbientLight`

## CI/CD

`.github/workflows/syncbeats-CD.yml` runs on pushes to `main` (production) and `nodejs-dev` (staging): builds Docker images → GHCR, provisions `.env` on EC2 over SSH, runs `prisma migrate deploy`, health-checks `/health`, and auto-rolls back to the previous image digest on failure. `IMAGE_TAG` equals the branch name.

## Pitfalls

1. **Socket connection state**: the singleton uses `autoConnect: false`; check `socket.connected` before emitting.
2. **Sync parameter changes**: all NTP/drift thresholds are per-device and adaptive — edit `PARAM_TABLE` in `useAdaptiveSync.ts`, not hard-coded constants. Widening thresholds on one tier only affects devices classified into that tier.
3. **Migrations**: `prisma migrate dev` for production-bound schema changes; `prisma db push` only for local iteration.
4. **CORS**: server allows `FRONTEND_URL` and any origin containing `syncbeats.app` (all origins in development). Configured in both the Express middleware and the Socket.IO server options in `server.ts` — keep them in sync.
5. **New participants converge slowly**: clock offset needs several NTP bursts to stabilize; expect higher drift for the first ~5–10 seconds after join.
6. **Root `.env` is the single config source** for backend, compose, and CI — the frontend only sees `NEXT_PUBLIC_*` vars at build time.
7. **AVAudioEngine Format Crash**: Apple's Core Audio cannot natively read `.webm` (Opus) files. When downloading audio via `yt-dlp` for the Mac app, always strictly pass `-f 'bestaudio[ext=m4a]'` (format 140 AAC stream) to prevent `error 1685348671`.
8. **Swift Download Latency Trap**: Never use `URLSession.shared.bytes(for:)` and iterate byte-by-byte via `for try await byte in asyncBytes` for large files. The massive context-switching overhead causes extreme delays (e.g., 30s for 3MB). Use `URLSession.shared.data(for:)` instead.
9. **Readiness Gate on Pause/Resume**: The server's `allReady()` logic must be checked *first* when `play()` is called so same-track pause/resumes skip the 10-second readiness timeout. Additionally, socket reconnects (`addParticipant`) wipe the server's `isReady` flags; native clients must listen for `room:snapshot` and immediately re-declare `room:clientReady` if their file is already loaded.

## Active Tasks
Please refer to [implementation_plan.md](./implementation_plan.md) for the active list of bugs and UI features being tracked.
