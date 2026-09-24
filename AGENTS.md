# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Project Overview

**SyncBeats** is a full-stack app for synchronized music playback across multiple devices (< 25ms target) using NTP-style clock offset estimation plus drift correction. Live at syncbeats.in. Monorepo layout:

- `dev/frontend/` — Next.js 16 (React 19, Tailwind 4) web client
- `dev/syncbeats-server/` — Express 5 + Socket.IO 4 + Prisma 7 (PostgreSQL) backend
- `dev/db-visualizer/` — custom Next.js database-inspection app (its own Prisma client, not Prisma Studio)
- `Syncbeats(apple)/` — Swift iOS app; `Syncbeats Android/` — Kotlin Android app
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

## Active Tasks
Please refer to [implementation_plan.md](./implementation_plan.md) for the active list of bugs and UI features being tracked.
