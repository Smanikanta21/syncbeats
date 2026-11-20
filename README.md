# SyncBeats

Listen together, on your own devices. SyncBeats lets a group join one room, build a shared queue, and control synchronized music playback from their browsers.

[Try SyncBeats](https://syncbeats.in) · [Get started locally](dev/LOCAL_DEVELOPMENT.md) · [Contribute](CONTRIBUTING.md) · [Roadmap](docs/ROADMAP.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## What you can do

- Create or join a room and invite people with a room code or QR code.
- Build a shared queue, upload audio you have the rights to use, and play, pause, or seek together.
- Let any participant control playback, with host-managed private rooms and join approval.
- Adjust participant volume and use the room's audio and visualizer controls.
- Explore music search and playlist integrations when the relevant providers are configured.

The landing page includes an interactive demo with original synthesized audio. Its device tiles are simulated. Try a real room on two devices to evaluate synchronization.

## How synchronization works

The server owns room state and broadcasts a shared playback timeline. Each browser estimates its clock offset with NTP-style round trips, schedules playback against server time, and corrects excessive drift with a short crossfade seek. Network quality determines adaptive synchronization thresholds.

**Less than 25 ms is a design target, not a guarantee.** Network jitter, browser behavior, device audio latency, and the first seconds after joining affect results. See the [architecture diagrams](docs/SYSTEM_DESIGN_DIAGRAMS.md) and [global sync design](docs/GLOBAL_SYNC_DESIGN.md).

## Run it locally

Use Node.js 24 LTS and npm. PostgreSQL is needed for rooms and accounts; Docker Compose can provide a disposable local database.

These commands are for a fresh clone. Keep any existing environment files if you already have local configuration.

```bash
# From the repository root
cp .env.example .env
cp dev/frontend/.env.example dev/frontend/.env
# Edit .env and replace JWT_SECRET with your own random value.

docker compose -f docker-compose.dev.yml up -d postgres

cd dev/syncbeats-server
export DOTENV_CONFIG_PATH=../../.env
npm ci
npm run prisma:generate
npx prisma migrate deploy
npm run dev
```

In another terminal:

```bash
cd dev/frontend
npm ci
npm run dev
```

Open **http://localhost:3000**. The backend runs at **http://localhost:4000** and exposes `/health`. Use a fresh local database for the migration command above.

The landing-page demo works without provider accounts. Account registration and email verification require your own Resend development credentials and verified sender; Google login requires your own OAuth app. Music providers require their own configuration and may need `yt-dlp` or `ffmpeg`. See the [full setup and verification guide](dev/LOCAL_DEVELOPMENT.md) before testing authenticated rooms or integrations.

## Repository layout

| Directory | Purpose |
| --- | --- |
| `dev/frontend/` | Next.js 16, React 19, Tailwind CSS 4 web client |
| `dev/syncbeats-server/` | Express, Socket.IO, Prisma and PostgreSQL backend |
| `dev/db-visualizer/` | Optional database inspection app; keep it on a trusted network |
| `Syncbeats(apple)/` | Experimental Swift client; see its README for current status |
| `docs/` | Architecture, roadmap, release checks and investigation notes |

Native clients and local relay work are experimental. Browser functionality does not establish native playback readiness.

## Help improve SyncBeats

Start with a reproducible bug report, a documentation fix, or an accessibility improvement. The [contribution guide](CONTRIBUTING.md) explains branches, package checks, and multi-device verification. Use the GitHub issue templates for bugs and feature ideas. Maintainers will mark suitable issues `good first issue` or `help wanted` as they are scoped.

Please follow the [code of conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately using the [security policy](SECURITY.md).

## License

Original SyncBeats code is licensed under [MIT](LICENSE). It permits personal and commercial reuse, modification, and distribution with the license and copyright notice retained. Dependencies and third-party content keep their own terms; see [third-party notices](THIRD_PARTY_NOTICES.md). The license does not grant rights to music supplied by users or external services.
