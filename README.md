# SyncBeats

> **Universal web-based multi-device music synchronization player**

Play music in perfect sync across all your devices—from smartphones to desktops. SyncBeats enables seamless, real-time audio synchronization for a unified listening experience.

[![Next.js](https://img.shields.io/badge/Next.js-16.2.3-black?logo=next.js)](https://nextjs.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20-green?logo=node.js)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue?logo=typescript)](https://www.typescriptlang.org/)

## ✨ Features

- **🎵 Multi-Device Sync** — Play music simultaneously across unlimited devices with frame-perfect synchronization
- **🔄 Real-Time Playback Control** — Play, pause, skip, and adjust volume in real-time on any device
- **👥 Room Management** — Create synced listening sessions and invite others to join
- **🎨 Modern UI** — Beautiful, responsive interface built with Next.js and Tailwind CSS
- **🔐 Secure Authentication** — JWT-based auth with device tracking via unique device keys
- **📱 Device Management** — Rename, replace, and manage registered devices
- **🔌 WebSocket Connectivity** — Real-time event streaming via Socket.IO
- **🧑‍💻 Developer Friendly** — RESTful API with comprehensive endpoints

## 🏗️ Architecture

### Frontend
- **Framework**: Next.js 16.2.3 with React 19.2.4
- **Styling**: Tailwind CSS 4 with Framer Motion animations
- **Real-time**: Socket.IO client for live event subscriptions
- **Icons**: Lucide React

### Backend
- **Runtime**: Node.js 20 with Express
- **Language**: TypeScript
- **Database**: PostgreSQL 16
- **ORM**: Prisma
- **Real-time**: Socket.IO server with EventBus pattern
- **Authentication**: JWT with device-key header tracking

### DevOps
- **Containerization**: Docker & Docker Compose
- **CI/CD**: GitHub Actions
- **Deployment**: GCP VM with Nginx reverse proxy
- **Process Management**: PM2
- **Health Checks**: Automated database, API, and WebSocket validation

## 🚀 Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (or use Docker)
- Git

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Smanikanta21/sync-beats.git
   cd sync-beats
   ```

2. **Setup backend**
   ```bash
   cd syncbeats-server
   npm install
   ```

3. **Setup frontend**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Start development environment**
   ```bash
   # From project root
   docker-compose up -d
   
   # In syncbeats-server terminal
   npm run dev
   
   # In frontend terminal
   npm run dev
   ```

5. **Access the application**
   - Frontend: `http://localhost:3000`
   - Backend API: `http://localhost:4000`

## 📚 API Documentation

### Authentication
- `POST /auth/register` — Create a new account
- `POST /auth/login` — Authenticate user
- `GET /auth/me` — Get current user profile
- `PATCH /auth/profile` — Update user profile

### Rooms
- `GET /rooms/mine` — Fetch user's rooms
- `POST /rooms` — Create a new room
- `PATCH /rooms/:roomId/host` — Transfer room ownership
- `DELETE /rooms/:roomId` — End a session

### Devices
- `GET /devices/mine` — List registered devices
- `POST /devices` — Register a new device
- `PATCH /devices/:deviceId` — Rename device
- `POST /devices/replace` — Replace device registration
- `PATCH /devices/:deviceId/activity` — Update device activity

### Health
- `GET /health` — Service health check
- `GET /socket.io/?EIO=4&transport=polling` — WebSocket availability probe

## 🔐 Authentication Flow

1. User registers/logs in with email and password
2. Backend generates JWT token and creates device entry
3. Frontend stores device key (unique identifier)
4. All API requests include `Authorization: Bearer <token>` header
5. All WebSocket events tagged with `X-Device-Id` header for tracking

## 🎮 Development

### Environment Variables

**Backend** (`.env` in `syncbeats-server/`)
```env
DATABASE_URL=postgresql://user:password@localhost:5432/syncbeats
JWT_SECRET=your_jwt_secret_key
NODE_ENV=development
PORT=4000
```

**Frontend** (`.env.local` in `frontend/`)
```env
NEXT_PUBLIC_SERVER_URL=http://localhost:4000
```

### Running Tests
```bash
# Backend
cd syncbeats-server && npm test

# Frontend
cd frontend && npm run lint
```

### Building for Production
```bash
# Backend
cd syncbeats-server && npm run build

# Frontend
cd frontend && npm run build
```

## 🐳 Docker Deployment

```bash
# Build and start all services
docker-compose up -d --build

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## 📊 Database Schema

### Core Tables
- **User** — User accounts with email, name, password hash
- **Device** — Registered devices (user-device association, device key, user agent)
- **Room** — Synced listening sessions (host user, creation timestamp)
- **RoomMember** — Room participants (room-device join table)

## 🔄 Real-Time Events

### WebSocket Events (Socket.IO)
- `playback-sync` — Play/pause state across devices
- `host-changed` — Room ownership transferred
- `device-online` / `device-offline` — Device connectivity status
- `room-ended` — Session terminated

## 📱 Device Management

- **Device Registration**: Automatic on first login with unique device key
- **Device Replacement**: Returning users can rebind to existing device
- **Device Renaming**: Custom names for better identification
- **Cleanup**: Automatic deletion of orphaned device records

## 🛠️ Troubleshooting

### Frontend not connecting to backend?
- Verify `NEXT_PUBLIC_SERVER_URL` is correctly set
- Check if backend is running on port 4000
- Ensure CORS is properly configured

### Database connection issues?
- Check PostgreSQL is running: `docker ps`
- Verify DATABASE_URL in env file
- Run migrations: `npm run prisma:migrate`

### WebSocket connection failed?
- Ensure Socket.IO server is running
- Check firewall/network policies
- Verify polling transport is enabled

## � License

This project is proprietary, All rights reserved.

## 👨‍💻 Author

**Abhinay Siraparapu**

## 🙏 Acknowledgments

- Built with [Next.js](https://nextjs.org/) and [Express.js](https://expressjs.com/)
- Real-time sync powered by [Socket.IO](https://socket.io/)
- UI crafted with [Tailwind CSS](https://tailwindcss.com/) and [Framer Motion](https://www.framer.com/motion/)
- Database management with [Prisma](https://www.prisma.io/)

---

**Made with ❤️ for music lovers everywhere**
