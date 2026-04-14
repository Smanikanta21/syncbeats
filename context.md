# SyncBeats — Project Context

## What is SyncBeats?
A **universal, web-based multi-device music synchronization player**. Think AirPlay but for every device because it runs in a browser. Users can host a "session room" and all connected devices (phones, laptops, speakers) play the exact same audio in perfect physical-room sync.

---

## Frontend Stack
- **Framework**: Next.js (App Router)
- **Styling**: Tailwind CSS
- **Animations**: Framer Motion
- **Location**: `/Users/abhinaysiraparapu/Library/Mobile Documents/com~apple~CloudDocs/Projects/sync-beats/frontend`

### Frontend Routes
| Route | Description |
|---|---|
| `/` | Landing page (Navbar, Hero, Features, HowItWorks, About, Contact, Footer) |
| `/login` | Unified auth page — single rectangular component, sliding Login↔Signup panels |
| `/hub` | Post-login Session Hub — "Host a Session" + "Join a Session" cards + Recent Rooms |
| `/profile` | Bento Grid profile/settings page |
| `/room/[id]` | Active room — Dynamic Island player + QR code + Connected Devices + Volume matrix |

### Design System
- **Palette**: `zinc-200` (text) / `zinc-500` (muted) / `black` (backgrounds)
- **Glow**: Minute silver breathing glow — `rgba(255,255,255,0.05→0.15)` pulsing `boxShadow`
- **Glass**: `bg-black/60 backdrop-blur-3xl border border-white/5`
- **Rounding**: `rounded-[2.5rem]` for cards, `rounded-full` for pills
- **Fonts**: `font-black` for headings, `tracking-widest` for labels

### Key Components
- **`<DynamicIsland>`**: Persistent across `(session)` routes. 3 states:
  1. **Hub Nav**: Thin pill with logo + profile avatar.
  2. **Expanded Player**: Drops when entering `/room/[id]` — full album art, controls, progress.
  3. **Compact Mini-Player**: Collapses on scroll >50px inside room. Click to scroll back to top.
- **`(session)` Route Group**: Shared layout at `app/(session)/layout.tsx` that mounts `<DynamicIsland>` once, persisting across Hub → Room → Profile navigations.

---

## Backend Architecture

### High-Level Design
- **Protocol**: Socket.IO (WebSocket) for real-time playback events
- **REST**: Express for room CRUD (create, list, get)
- **Sync**: NTP-style clock offset handshake to correct client clock drift
- **State**: In-Memory (Phase 1) → Redis (Phase 2)

### Backend Location
`/Users/abhinaysiraparapu/Library/Mobile Documents/com~apple~CloudDocs/Projects/sync-beats/syncbeats-server/`

### Folder Structure
```
syncbeats-server/
├── src/
│   ├── server.ts                  ← SyncBeatsServer (Facade)
│   ├── config/config.ts
│   ├── core/
│   │   ├── RoomManager.ts         ← Singleton
│   │   ├── Room.ts                ← State machine (EventEmitter)
│   │   ├── Participant.ts         ← Value object
│   │   └── PlaybackState.ts       ← Enum
│   ├── sync/
│   │   ├── SyncEngine.ts          ← Strategy pattern
│   │   ├── NTPSyncStrategy.ts
│   │   └── ClockOffset.ts
│   ├── events/
│   │   ├── EventBus.ts            ← Observer singleton
│   │   └── events.ts
│   ├── handlers/
│   │   ├── SocketHandler.ts       ← Command dispatcher
│   │   └── RoomRoutes.ts          ← Express REST
│   ├── store/
│   │   ├── IStateStore.ts         ← Repository interface
│   │   ├── InMemoryStore.ts       ← Phase 1
│   │   └── RedisStore.ts          ← Phase 2 stub
│   └── types/index.ts
├── tsconfig.json
└── package.json
```

### Design Patterns Used
| Pattern | Class | Purpose |
|---|---|---|
| Facade | `SyncBeatsServer` | Boots entire server in one `start()` call |
| Singleton | `RoomManager`, `EventBus` | Global room registry, decoupled event bus |
| State Machine | `Room` | Guards playback transitions (IDLE→PLAYING→PAUSED) |
| Strategy | `SyncEngine` + `ISyncStrategy` | Swap NTP algo without touching core |
| Observer | `EventBus` | Room emits events; `SocketHandler` listens — no circular deps |
| Repository | `IStateStore` | Swap `InMemoryStore` → `RedisStore` in one config line |
| Command | `SocketHandler` | All socket events mapped to room method calls |

---

## The Sync Problem (Core Algorithm)

### NTP Clock Handshake
Each client runs this on join (and every 5 seconds):
```
Client → Server: sync:ping  { t0: Date.now() }
Server → Client: sync:pong  { t0, t1, t2 }      ← t1/t2 are server timestamps
Client computes: clockOffset = ((t1 - t0) + (t2 - t3)) / 2
```
Client keeps last 5 offsets, uses **median** to reject network outliers.

### Scheduled Playback
When server broadcasts `room:stateChanged` with `state: PLAYING`:
```typescript
audioEl.currentTime = (snapshot.position + (Date.now() - snapshot.timestamp + clockOffset)) / 1000;
```
If drift > 150ms → hard correct. If drift < 150ms → gradual `playbackRate` nudge.

---

## Socket Event Contract

### Client → Server
| Event | Payload | Description |
|---|---|---|
| `room:join` | `{ roomId, displayName }` | Join/create a room |
| `room:leave` | `{ roomId }` | Leave room |
| `playback:play` | `{ roomId }` | Host plays |
| `playback:pause` | `{ roomId }` | Host pauses |
| `playback:seek` | `{ roomId, position }` | Host seeks (ms) |
| `playback:setTrack` | `{ roomId, trackUrl }` | Host sets track |
| `sync:ping` | `{ t0 }` | NTP handshake initiation |

### Server → Client
| Event | Payload | Description |
|---|---|---|
| `room:snapshot` | `RoomSnapshot` | Full state on join |
| `room:stateChanged` | `RoomSnapshot` | Broadcast on every transition |
| `sync:pong` | `{ t0, t1, t2 }` | NTP response |
| `room:participantJoined` | `Participant` | New device joined |
| `room:participantLeft` | `socketId` | Device disconnected |
| `room:hostChanged` | `socketId` | New host elected |

---

## Build Order (Step-by-Step)
1. `types/index.ts` + `PlaybackState.ts` — pure types
2. `Participant.ts` + `Room.ts` — state machine, unit testable, no I/O
3. `RoomManager.ts` — room registry + disconnect routing
4. `SyncEngine.ts` — pure math, unit testable
5. `EventBus.ts` — thin singleton
6. Wire `Room` → emit into `EventBus` on each transition
7. `InMemoryStore.ts` + `IStateStore.ts`
8. `SocketHandler.ts` — command mapping
9. `RoomRoutes.ts` — REST endpoints
10. `SyncBeatsServer.ts` — Facade that assembles and boots

---

## Scaling Path
- **Phase 1**: InMemoryStore (single node, current)
- **Phase 2**: Replace `IStateStore` impl with `RedisStore` + Socket.IO Redis Adapter for multi-node pub/sub
- **No other code changes needed** by design (interface-driven architecture)
