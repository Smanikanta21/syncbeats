# Sync Beats

Cross-platform synchronized music playback with rooms, sockets, realtime clock sync, and shared storage.

## Problem Statement
Ecosystem-locked solutions (e.g., AirPlay) cannot sync audio across heterogeneous devices. Sync Beats provides platform-neutral, network-based clock sync and playback coordination for Android, iOS, macOS, and Windows.

## Architecture
- Frontend: Next.js (App Router), Tailwind CSS — hosted on Vercel
- Backend API: Express (Vercel serverless)
- Sockets: Socket.IO on Google Cloud Run (asia-south1) — https://sync-beats-sockets-india-1006171035854.asia-south1.run.app
- Database: PostgreSQL (Neon via Prisma)
- Storage: Google Cloud Storage bucket `sync-beats-audio` for uploaded tracks

## Hosting URLs
- Frontend (Vercel): https://syncbeats.app
- Backend API (Vercel serverless): https://api.syncbeats.app
- Sockets (Cloud Run, asia-south1): https://sync-beats-sockets-india-1006171035854.asia-south1.run.app

## Features
- JWT auth (email/password + Google OAuth)
- Room management (create, join, verify, recent rooms)
- Device tracking per user
- Time-synced playback over Socket.IO with server clock offset + RTT compensation
- Mobile audio unlock flow
- User search (case-insensitive)
- File upload endpoint for songs to GCS (returns a URL)

## API (non-auth highlights)
- POST `/signup`, `/login`, `/logout` — auth
- GET `/getprofiledata`, `/profile` — profile fetch
- PATCH `/profile` — profile update
- POST `/change-password` — change password
- DELETE `/profile` — delete account
- PUT `/device/:id`, DELETE `/device/:id` — manage devices
- POST `/createroom` — create room
- POST `/joinroom` — join room
- GET `/verifyroom/:code` — verify room
- GET `/room/:code` — room details
- GET `/recent-rooms` — recent rooms (pagination/sort/filter)
- PUT `/room/:code` — update room
- DELETE `/room/:code` — delete room
- POST `/room/:code/leave` — leave room
- POST `/upload` — upload audio to GCS
- GET `/users/search` — search users (returns `{ users: [...] }`)
- OAuth: `/google`, `/callback/google`

Auth-related
- POST `/signup`, `/login`, `/logout`
- GET `/getprofiledata`
- PATCH `/profile`
- DELETE `/device/:id`
- Google OAuth callback: `/callback/google`

## Environment
Backend `.env` (local example):
```
PORT=5001
JWT=your_jwt_secret
SESSION_SECRET=your_session_secret
DATABASE_URL=postgres_connection_string
BACKEND_URL=http://localhost:5001
FRONTEND_DEV_URL=http://localhost:3000
FRONTEND_URL=https://your-frontend-domain
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=http://localhost:5001/auth/callback/google
GCS_BUCKET_NAME=sync-beats-audio
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/gcs-key.json
```
Frontend `.env.local` (example):
```
NEXT_PUBLIC_API_URL=http://localhost:5001
NEXT_PUBLIC_SOCKET_URL=http://localhost:5002
```
Set `NEXT_PUBLIC_SOCKET_URL` to the Cloud Run URL in production.

## Local Development
```
# Terminal 1: sockets
cd sockets && npm install && node server.js

# Terminal 2: backend
cd express-backend && npm install && npm run dev

# Terminal 3: frontend
cd frontend && npm install && npm run dev
```

## Deployment Notes
- Backend: deploy to Vercel; set env vars (JWT, DB URL, Google OAuth, GCS) in Vercel dashboard.
- Sockets: build & deploy container to Cloud Run (use region near users); bind to 0.0.0.0 and use PORT env.
- Storage: use GCS bucket `sync-beats-audio`; service account with Storage Object Admin for uploads.
- Frontend: deploy to Vercel; set `NEXT_PUBLIC_SOCKET_URL` to Cloud Run sockets URL and `NEXT_PUBLIC_API_URL` to backend URL.

## Proposal Reference
See `Syncbeats Proposal AP Capstone Project.pdf` for the full project proposal and problem statement.