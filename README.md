<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io" />
  <img src="https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express" />
  <img src="https://img.shields.io/badge/PostgreSQL-Neon-4169E1?style=for-the-badge&logo=postgresql" />
  <img src="https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma" />
</p>

# 🎵 SyncBeats

**Play music in perfect sync across every device in the room.**

SyncBeats lets a group of friends join a shared room, upload audio, and hear it play simultaneously on all their phones and laptops — synchronized to within **< 25ms** using NTP-style clock correction and proportional drift compensation.

---

## ✨ Features

- 🔊 **Sub-25ms Sync** — NTP clock sync + proportional playback rate correction keeps all devices locked
- 🎛 **Shared Queue** — Upload tracks, drag-and-drop reorder, delete — changes broadcast to everyone in real time
- 👥 **Multi-Device Rooms** — Join with a 6-digit code or QR scan. No app install needed
- 🎚 **Per-Device Volume** — Each participant can control their own volume and see others'
- 🏝 **Dynamic Island** — Persistent floating mini-player with playback controls, upload zone, and live sync offset display
- 🔐 **Full Auth** — Email/password, Google SSO, email verification, password reset (link + OTP)
- 📱 **Mobile-First** — Responsive design, touch-friendly drag-and-drop with 250ms long-press activation
- 🐳 **Docker-Ready** — One command to deploy the backend anywhere

---

## 🏗 Architecture

```
sync-beats/
├── frontend/                   # Next.js 16 (React 19, Tailwind 4)
│   ├── app/
│   │   ├── page.tsx            # Landing page
│   │   ├── login/              # Auth pages
│   │   └── (session)/
│   │       ├── layout.tsx      # Session layout + DynamicIsland
│   │       ├── hub/            # Room list
│   │       └── room/[id]/      # Room page (sync engine lives here)
│   ├── components/
│   │   ├── DynamicIsland.tsx   # Persistent floating player
│   │   ├── SortableTrackItem.tsx # Drag-and-drop queue item
│   │   ├── Hero.tsx            # Landing hero section
│   │   └── ...
│   ├── hooks/
│   │   ├── useRoom.ts          # Socket.IO room + NTP sync + drift correction
│   │   └── useAudioPlayer.ts   # HTMLAudioElement wrapper
│   ├── context/
│   │   ├── AudioContext.tsx     # Global audio state
│   │   ├── AuthContext.tsx      # JWT + user session
│   │   ├── UploadContext.tsx    # Drag-and-drop upload state
│   │   └── SyncContext.tsx      # Clock offset sharing
│   └── lib/
│       ├── api.ts              # Typed fetch wrapper
│       ├── socket.ts           # Socket.IO client singleton
│       └── types.ts            # Shared TypeScript interfaces
│
├── syncbeats-server/            # Express 5 + Socket.IO 4
│   ├── src/
│   │   ├── server.ts           # Entry point + facade
│   │   ├── core/
│   │   │   ├── Room.ts         # Playback state machine (EventEmitter)
│   │   │   ├── RoomManager.ts  # Singleton room registry
│   │   │   └── PlaybackState.ts
│   │   ├── sync/
│   │   │   └── SyncEngine.ts   # NTP clock sync (strategy pattern)
│   │   ├── handlers/
│   │   │   ├── SocketHandler.ts # WebSocket event dispatcher
│   │   │   ├── RoomRoutes.ts   # REST: rooms, queue, reorder
│   │   │   ├── AuthRoutes.ts   # REST: auth endpoints
│   │   │   ├── UploadRoutes.ts # REST: file upload
│   │   │   └── DeviceRoutes.ts # REST: device trust
│   │   ├── db/
│   │   │   ├── RoomRepository.ts # Prisma data-access
│   │   │   └── prisma.ts       # Prisma singleton
│   │   ├── auth/
│   │   │   ├── AuthService.ts  # Auth business logic
│   │   │   ├── authMiddleware.ts
│   │   │   └── UserRepository.ts
│   │   └── events/
│   │       └── EventBus.ts     # Typed singleton observer
│   └── prisma/
│       └── schema.prisma       # Database schema
│
├── docker-compose.yml
├── SYSTEM_DESIGN.md
└── .env
```

> 📖 See [SYSTEM_DESIGN.md](./SYSTEM_DESIGN.md) for a deep dive into the sync engine, state machine, event flow, and deployment architecture.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** ≥ 20
- **PostgreSQL** database (or a [Neon](https://neon.tech) free-tier instance)
- **npm** ≥ 10

### 1. Clone & Install

```bash
git clone https://github.com/Smanikanta21/sync-beats.git
cd sync-beats

# Install root workspace
npm install

# Install backend dependencies
cd syncbeats-server && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

```env
# ── Database ──────────────────────────────────────────────
DATABASE_URL="postgresql://user:pass@host/dbname?sslmode=require"

# ── Auth ──────────────────────────────────────────────────
JWT_SECRET="your-secret-key"
GOOGLE_CLIENT_ID="your-google-client-id"

# ── Email (Resend) ────────────────────────────────────────
RESEND_API_KEY="re_xxxxxxxxxxxx"
AUTH_FROM_EMAIL="noreply@yourdomain.com"

# ── URLs ──────────────────────────────────────────────────
AUTH_PUBLIC_APP_URL="http://localhost:3000"
FRONTEND_URL="http://localhost:3000"
NEXT_PUBLIC_SERVER_URL="http://localhost:4000"
```

### 3. Database Setup

```bash
cd syncbeats-server
npx prisma generate
npx prisma db push
```

### 4. Run Development Servers

```bash
# Terminal 1 — Backend (port 4000)
cd syncbeats-server
npm run dev

# Terminal 2 — Frontend (port 3000)
cd frontend
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## 🐳 Docker Deployment

```bash
# Build and run the backend
docker compose up -d

# The frontend deploys separately on Vercel (or any static host)
```

The `docker-compose.yml` configures:
- Backend container with all env vars
- Persistent `uploads` volume for audio files
- Port mapping (default: 4000)

---

## 🔌 API Reference

### Auth (`/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create account (name, email, password) |
| `POST` | `/auth/login` | Login → JWT |
| `POST` | `/auth/google` | Google OAuth → JWT |
| `POST` | `/auth/verification/resend` | Resend email verification |
| `POST` | `/auth/verification/confirm` | Confirm email token |
| `POST` | `/auth/password/forgot` | Send reset email/OTP |
| `POST` | `/auth/password/reset` | Reset password (token or OTP) |
| `GET`  | `/auth/me` | Get current user (🔒 protected) |

### Rooms (`/rooms`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/rooms` | Create a room (🔒) |
| `GET`  | `/rooms/mine` | List your rooms (🔒) |
| `GET`  | `/rooms/:id` | Get room details |
| `DELETE` | `/rooms/:id` | End a room (🔒) |
| `PATCH` | `/rooms/:id/host` | Transfer host (🔒) |
| `POST` | `/rooms/:id/upload` | Upload audio file |
| `DELETE` | `/rooms/:id/queue/:itemId` | Remove queue item |
| `PUT` | `/rooms/:id/queue/reorder` | Reorder queue (🔒) |

### WebSocket Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `room:join` | Client → Server | `{ roomId, displayName }` |
| `room:leave` | Client → Server | `{ roomId }` |
| `playback:play` | Client → Server | `{ roomId }` |
| `playback:pause` | Client → Server | `{ roomId }` |
| `playback:seek` | Client → Server | `{ roomId, position }` |
| `playback:ended` | Client → Server | `{ roomId, trackUrl }` |
| `room:clientReady` | Client → Server | `{ roomId }` |
| `sync:ping` | Client → Server | `{ t0 }` |
| `sync:pong` | Server → Client | `{ t0, t1, t2 }` |
| `room:snapshot` | Server → Client | Full `RoomSnapshot` |
| `room:stateChanged` | Server → Client | Updated `RoomSnapshot` |
| `room:trackSet` | Server → Client | `{ trackUrl, title }` |
| `room:queueChanged` | Server → Client | `{ queue }` |
| `room:allReady` | Server → Client | _(empty)_ |

---

## 🎯 How Sync Works

1. **On join**: Client fires 6 rapid NTP pings (60ms apart) to converge clock offset in ~360ms
2. **Steady-state**: Pings continue every 2s. The median of the last 5 offsets is used
3. **On play**: Server records `{ position, timestamp }`. Client computes expected position:
   ```
   expected = position + (now - timestamp) + clockOffset
   ```
4. **Drift correction**:
   - < 15ms → ignore (deadband)
   - 15–800ms → gently adjust `playbackRate` (±2–10%) over 3+ observations
   - \> 800ms → hard seek

This achieves sub-25ms synchronization across WiFi without any specialized hardware.

---

## 🛠 Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Framer Motion |
| Drag & Drop | @dnd-kit/core, @dnd-kit/sortable |
| Icons | Lucide React |
| Backend | Express 5, Socket.IO 4, TypeScript 6 |
| Database | PostgreSQL (Neon), Prisma ORM |
| Auth | JWT, bcryptjs, Google Auth Library |
| Email | Nodemailer + Resend |
| File Upload | Multer |
| Deployment | Docker, Vercel (frontend) |

---

## 📄 License

This project is private. All rights reserved.

---

<p align="center">
  Built with ❤️ by <a href="https://github.com/Smanikanta21">Smanikanta21</a>
</p>
