<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js" />
  <img src="https://img.shields.io/badge/React-19-61DAFB?style=for-the-badge&logo=react" />
  <img src="https://img.shields.io/badge/Socket.IO-4-010101?style=for-the-badge&logo=socket.io" />
  <img src="https://img.shields.io/badge/Express-5-000000?style=for-the-badge&logo=express" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql" />
  <img src="https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma" />
  <img src="https://img.shields.io/badge/AWS-S3%20%2B%20CloudFront-FF9900?style=for-the-badge&logo=amazonaws" />
  <img src="https://img.shields.io/badge/Docker-Compose-2496ED?style=for-the-badge&logo=docker" />
</p>

# SyncBeats

**Play music in perfect sync across every device in the room.**

SyncBeats lets a group of friends join a shared room, upload audio, and hear it play simultaneously on all their phones and laptops — synchronized to within **< 25ms** using NTP-style clock correction and proportional drift compensation.

> **Live at [syncbeats.in](https://syncbeats.in)**

---

## Features

| Feature | Description |
|---------|-------------|
| **Sub-25ms Sync** | NTP clock sync with proportional playback rate correction keeps all devices locked in phase |
| **Shared Queue** | Upload tracks, drag-and-drop to reorder, delete items — all changes broadcast in real time |
| **Multi-Device Rooms** | Join with a 6-digit code or QR scan. No app install required |
| **QR Scanner** | Universal camera-based QR scanning (jsQR + native BarcodeDetector fallback) works on all browsers |
| **Per-Device Volume** | Each participant controls their own volume independently |
| **Dynamic Island** | Persistent floating mini-player with playback controls, upload zone, and live sync offset display |
| **Network Stats** | Real-time latency, jitter, and drift visualization per device |
| **Full Auth** | Email/password, Google SSO, email verification, password reset (link + OTP) |
| **Dark/Light Mode** | Theme toggle with system preference detection |
| **S3 + CloudFront** | Audio files stored on AWS S3, served via CloudFront CDN for low-latency global delivery |
| **Mobile-First** | Fully responsive with touch-optimized drag-and-drop (250ms long-press activation) |
| **SEO Ready** | Dynamic sitemap, robots.txt, Open Graph metadata, and legal compliance pages |
| **CI/CD Pipeline** | Automated GitHub Actions pipeline with Docker builds, EC2 deployment, health checks, and rollback |

---

## Architecture

```
sync-beats/
├── frontend/                        # Next.js 16 (React 19, Tailwind CSS 4)
│   ├── app/
│   │   ├── page.tsx                 # Landing page
│   │   ├── layout.tsx               # Root layout (SEO, fonts, analytics)
│   │   ├── login/                   # Unified auth (login + register)
│   │   ├── forgot-password/         # Password recovery flow
│   │   ├── reset-password/          # Password reset page
│   │   ├── verify-email/            # Email verification
│   │   ├── verify-email-sent/       # Verification sent confirmation
│   │   ├── privacy-policy/          # Legal — Privacy Policy
│   │   ├── terms-of-service/        # Legal — Terms of Service
│   │   ├── cookie-settings/         # Cookie consent manager
│   │   ├── not-found.tsx            # Custom 404 page
│   │   ├── sitemap.ts               # Dynamic sitemap generation
│   │   ├── robots.ts                # Robots.txt configuration
│   │   └── (session)/               # Authenticated routes
│   │       ├── layout.tsx           # Session layout + DynamicIsland
│   │       ├── hub/                 # Room list + QR scanner
│   │       └── room/[id]/           # Room page (sync engine)
│   ├── components/
│   │   ├── DynamicIsland.tsx        # Persistent floating player
│   │   ├── SortableTrackItem.tsx    # Drag-and-drop queue item
│   │   ├── NetworkStats.tsx         # Live latency/jitter panel
│   │   ├── Hero.tsx                 # Landing hero section
│   │   ├── Features.tsx             # Feature showcase
│   │   ├── HowItWorks.tsx           # Step-by-step guide
│   │   ├── About.tsx                # About section
│   │   ├── Contact.tsx              # Contact form
│   │   ├── Navbar.tsx               # Navigation bar
│   │   ├── Footer.tsx               # Site footer
│   │   └── ThemeToggle.tsx          # Dark/light mode switch
│   ├── hooks/
│   │   ├── useRoom.ts              # Socket.IO room + NTP sync + drift correction
│   │   ├── useAudioPlayer.ts       # HTMLAudioElement wrapper with sync
│   │   ├── useNetworkStats.ts      # Latency/jitter measurement
│   │   └── useSpatialAudio.ts      # Web Audio API spatial positioning
│   ├── context/
│   │   ├── AudioContext.tsx         # Global audio state
│   │   ├── AuthContext.tsx          # JWT + user session
│   │   ├── UploadContext.tsx        # Drag-and-drop upload state
│   │   ├── SyncContext.tsx          # Clock offset sharing
│   │   └── ThemeProvider.tsx        # Theme persistence
│   └── lib/
│       ├── api.ts                   # Typed fetch wrapper
│       ├── socket.ts               # Socket.IO client singleton
│       ├── types.ts                 # Shared TypeScript interfaces
│       └── utils.ts                 # Utility functions
│
├── syncbeats-server/                 # Express 5 + Socket.IO 4
│   ├── src/
│   │   ├── server.ts                # Entry point + route registration
│   │   ├── core/
│   │   │   ├── Room.ts              # Playback state machine (EventEmitter)
│   │   │   ├── RoomManager.ts       # Singleton room registry
│   │   │   └── PlaybackState.ts     # Playback state enum
│   │   ├── sync/
│   │   │   └── SyncEngine.ts        # NTP clock sync (strategy pattern)
│   │   ├── handlers/
│   │   │   ├── SocketHandler.ts     # WebSocket event dispatcher
│   │   │   ├── RoomRoutes.ts        # REST: rooms, queue, reorder
│   │   │   ├── AuthRoutes.ts        # REST: auth endpoints
│   │   │   ├── UploadRoutes.ts      # REST: S3 file upload
│   │   │   └── DeviceRoutes.ts      # REST: device trust
│   │   ├── db/
│   │   │   ├── RoomRepository.ts    # Prisma data-access
│   │   │   └── prisma.ts            # Prisma singleton
│   │   ├── auth/
│   │   │   ├── AuthService.ts       # Auth business logic
│   │   │   ├── authMiddleware.ts    # JWT middleware
│   │   │   └── UserRepository.ts    # User data-access
│   │   ├── store/
│   │   │   ├── IStateStore.ts       # State store interface
│   │   │   └── StorageService.ts    # Storage abstraction
│   │   ├── utils/
│   │   │   └── s3.ts                # AWS S3 client (lazy init + sanitization)
│   │   ├── types/
│   │   │   └── index.ts             # Server-side type definitions
│   │   └── events/
│   │       └── EventBus.ts          # Typed singleton observer
│   └── prisma/
│       └── schema.prisma            # Database schema
│
├── .github/workflows/
│   └── syncbeats-CD.yml             # CI/CD pipeline (GitHub Actions)
├── docker-compose.yml               # Production: 4 services
├── docker-compose.dev.yml           # Development override
└── .env                             # Environment variables
```

---

## Getting Started

### Prerequisites

- **Node.js** >= 20
- **PostgreSQL** 16+ (or Docker)
- **npm** >= 10
- **AWS Account** (S3 bucket + CloudFront distribution for audio storage)

### 1. Clone and Install

```bash
git clone https://github.com/Smanikanta21/sync-beats.git
cd sync-beats

# Install backend dependencies
cd syncbeats-server && npm install

# Install frontend dependencies
cd ../frontend && npm install
```

### 2. Environment Variables

Create a `.env` file in the project root:

| Variable | Description |
|----------|-------------|
| `NODE_ENV` | `development` or `production` |
| `PORT` | Backend API port (default: `4000`) |
| `STUDIO_PORT` | Prisma Studio port (default: `5555`) |
| `FRONTEND_PORT` | Frontend port (default: `3000`) |
| `POSTGRES_USER` | PostgreSQL username |
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `POSTGRES_DB` | PostgreSQL database name |
| `JWT_SECRET` | Secret key for signing JWTs |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `FRONTEND_URL` | Frontend URL (used for CORS and email links) |
| `AUTH_FROM_EMAIL` | Sender address for auth emails |
| `RESEND_API_KEY` | Resend API key for transactional email |
| `NEXT_PUBLIC_SERVER_URL` | Backend API URL (used by the frontend at build time) |
| `AWS_REGION` | AWS region (default: `ap-south-1`) |
| `AWS_ACCESS_KEY_ID` | AWS IAM access key |
| `AWS_SECRET_ACCESS_KEY` | AWS IAM secret key |
| `S3_BUCKET_NAME` | S3 bucket for audio files (default: `syncbeats-audio`) |
| `CDN_DOMAIN` | CloudFront distribution domain |

### 3. Database Setup

```bash
cd syncbeats-server
npx prisma generate
npx prisma db push     # Development
npx prisma migrate dev # Or run migrations
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

## Docker Deployment

The `docker-compose.yml` orchestrates **4 services**:

| Service | Image | Purpose |
|---------|-------|---------|
| `postgres` | `postgres:16-alpine` | PostgreSQL database with persistent volume |
| `server` | `ghcr.io/smanikanta21/syncbeats-server` | Express API + Socket.IO + Prisma |
| `frontend` | `ghcr.io/smanikanta21/syncbeats-frontend` | Next.js SSR frontend |
| `studio` | _(same as server)_ | Prisma Studio for database inspection |

```bash
# Start everything
docker compose up -d

# Or start individual services
docker compose up -d postgres server frontend
```

### CI/CD Pipeline

The GitHub Actions workflow (`.github/workflows/syncbeats-CD.yml`) automates:

1. **Build** — Docker images for backend + frontend pushed to GHCR
2. **Provision** — `.env` file securely assembled and SCP'd to EC2
3. **Deploy Backend** — Pull image → start Postgres → run migrations → start server + studio → health check
4. **Deploy Frontend** — Pull image → start container → health check
5. **Finalize** — Reload Nginx, prune old images
6. **Rollback** — Automatic rollback on deployment failure

Supports **branch-based environments** (`main` → production, `nodejs-dev` → staging).

---

## API Reference

### Authentication (`/auth`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/register` | Create account (name, email, password) |
| `POST` | `/auth/login` | Login, returns JWT |
| `POST` | `/auth/google` | Google OAuth, returns JWT |
| `POST` | `/auth/verification/resend` | Resend email verification |
| `POST` | `/auth/verification/confirm` | Confirm email token |
| `POST` | `/auth/password/forgot` | Send reset email or OTP |
| `POST` | `/auth/password/reset` | Reset password (token or OTP) |
| `GET`  | `/auth/me` | Get current user (protected) |

### Rooms (`/rooms`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/rooms` | Create a room (protected) |
| `GET`  | `/rooms/mine` | List your rooms (protected) |
| `GET`  | `/rooms/:id` | Get room details |
| `DELETE` | `/rooms/:id` | End a room (protected) |
| `PATCH` | `/rooms/:id/host` | Transfer host (protected) |
| `POST` | `/rooms/:id/upload` | Upload audio file to S3 |
| `DELETE` | `/rooms/:id/queue/:itemId` | Remove queue item |
| `PUT` | `/rooms/:id/queue/reorder` | Reorder queue (protected) |

### Devices (`/devices`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/devices` | List trusted devices (protected) |
| `PATCH` | `/devices/:id` | Rename a device (protected) |

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

## How Sync Works

1. **On join**: The client fires 6 rapid NTP pings (60ms apart) to converge the clock offset within ~360ms.
2. **Steady-state**: Pings continue every 2s. The median of the last 5 offset samples is used as the canonical offset.
3. **On play**: The server records `{ position, timestamp }`. Each client computes its expected position:
   ```
   expected = position + (now - timestamp) + clockOffset
   ```
4. **Drift correction**:
   - **< 15ms**: Ignored (within perceptual deadband)
   - **15–800ms**: Playback rate is gently adjusted (±2–10%) over 3+ consecutive observations
   - **> 800ms**: Hard seek to the expected position

This achieves **sub-25ms synchronization** across WiFi without any specialized hardware.

---

## Infrastructure

```
┌─────────────────────────────────────────────────────────────┐
│                     AWS EC2 Instance                        │
│                                                             │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────────────┐  │
│  │ Nginx    │──│  Frontend    │  │  Backend (Express)    │  │
│  │ Reverse  │  │  (Next.js)   │  │  + Socket.IO          │  │
│  │ Proxy    │  │  :3000       │  │  :4000                │  │
│  └──────────┘  └──────────────┘  └───────────┬───────────┘  │
│       │                                      │              │
│       │         ┌──────────────┐    ┌─────────▼──────────┐  │
│       │         │ Prisma       │    │ PostgreSQL 16      │  │
│       │         │ Studio :5555 │    │ (Docker Volume)    │  │
│       │         └──────────────┘    └────────────────────┘  │
└───────┼─────────────────────────────────────────────────────┘
        │
        ▼
   ┌──────────┐         ┌────────────────┐
   │ CloudFlare│  ──────▶│ AWS CloudFront │
   │ DNS       │         │ CDN            │
   └──────────┘         └───────┬────────┘
                                │
                        ┌───────▼────────┐
                        │ AWS S3         │
                        │ Audio Storage  │
                        └────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 16, React 19, Tailwind CSS 4, Framer Motion |
| Drag & Drop | @dnd-kit/core, @dnd-kit/sortable |
| QR Scanning | jsQR (universal), native BarcodeDetector (Chrome) |
| Icons | Lucide React |
| Backend | Express 5, Socket.IO 4, TypeScript 6 |
| Database | PostgreSQL 16, Prisma ORM 7 |
| Auth | JWT, bcryptjs, Google Auth Library |
| Email | Nodemailer + Resend |
| Storage | AWS S3 + CloudFront CDN |
| File Upload | Multer → S3 |
| Containerization | Docker, Docker Compose |
| CI/CD | GitHub Actions → GHCR → EC2 |
| Reverse Proxy | Nginx |
| DNS | Cloudflare |

---

## Legal Pages

SyncBeats includes production-ready compliance pages:

- [**Privacy Policy**](https://syncbeats.app/privacy-policy) — Data collection, retention, and user rights
- [**Terms of Service**](https://syncbeats.app/terms-of-service) — Usage terms, licensing, DMCA
- [**Cookie Settings**](https://syncbeats.app/cookie-settings) — Interactive cookie consent manager with localStorage persistence

---

## License

This project is private. All rights reserved.

---

<p align="center">
  Built by <a href="https://github.com/Smanikanta21">Abhinay Siraparapu</a>
</p>
