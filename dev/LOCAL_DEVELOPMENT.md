# Local development

Run web commands inside the relevant package under `dev/`. Use Node.js 24 LTS, npm, and a disposable local PostgreSQL database. Each package has its own lockfile; there is no root npm package.

## Environment

From the repository root, copy `.env.example` to `.env` and `dev/frontend/.env.example` to `dev/frontend/.env`. Do not overwrite existing local files. Replace `JWT_SECRET` with a random value, for example from `openssl rand -hex 32`. Keep these files untracked.

The root `.env` is the source for backend and Compose settings. `dotenv/config` resolves paths from the package working directory: when running backend commands below, set `DOTENV_CONFIG_PATH=../../.env`. Next.js loads the frontend's own environment file. Put only public browser settings in `NEXT_PUBLIC_*`; frontend environment changes require a restart or rebuild.

## Database and backend

```bash
# Repository root: PostgreSQL only, on host port 5439
# This is a standalone development stack, not a production override.
docker compose -f docker-compose.dev.yml up -d postgres

cd dev/syncbeats-server
export DOTENV_CONFIG_PATH=../../.env
npm ci
npm run prisma:generate
# Apply committed migrations to a fresh, disposable local database.
npx prisma migrate deploy
npm run dev
```

Backend: `http://localhost:4000`. Check `curl http://localhost:4000/health` once it starts. Prisma 7 reads `DATABASE_URL` through `prisma.config.ts`; keep the environment setting above for Prisma commands too.

Use `npm run prisma:migrate` when creating a schema migration for a contribution. Commit the resulting SQL and regenerate Prisma. The seed command is optional; review `prisma/seed.ts` before running it. Do not point development commands at production data.

To stop the local database, run `docker compose -f docker-compose.dev.yml down` from the root. The volume is retained. Removing volumes deletes local data.

## Frontend

In another terminal:

```bash
cd dev/frontend
npm ci
npm run dev
```

Frontend: `http://localhost:3000`. The checked-in environment example uses the backend at `http://localhost:4000`. For testing on another device, use a reachable host address for `NEXT_PUBLIC_SERVER_URL` and a matching `FRONTEND_URL`; restart both servers after changing environment settings.

The landing-page demo needs no authentication and uses original synthesized loops. It simulates devices; it does not measure live room synchronization.

## Accounts and optional integrations

| Feature | Configuration |
| --- | --- |
| Email registration, verification and password reset | Your own `RESEND_API_KEY` and verified `AUTH_FROM_EMAIL` sender |
| Google login | Your own OAuth client: backend `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, frontend `NEXT_PUBLIC_GOOGLE_CLIENT_ID` |
| Spotify | Your own `SPOTIFY_CLIENT_ID`, `SPOTIFY_CLIENT_SECRET` and callback URL |
| Search/provider adapters | Configure the credentials required by the adapter, such as `RAPID_API_KEY` / `RAPID_API_KEYS` |
| Multi-instance Socket.IO | Optional `REDIS_URL` |

Authenticated room testing requires a usable login/verification configuration. The frontend demo and package checks can be developed without production provider credentials.

Some audio-source paths invoke `yt-dlp`; install it and put it on `PATH` for those paths. Install `ffmpeg` for conversion paths and regenerating demo samples. Provider access and availability depend on their terms; use audio you have the right to use. Upload-based testing avoids dependence on music search providers once an account is available.

The backend's `youtube-dl-exec` dependency downloads a bundled executable during `npm ci`. If GitHub rate-limits that download, use `YOUTUBE_DL_SKIP_DOWNLOAD=true npm ci` for build/unit-test work. This skips the bundled executable; provider paths that use it will not work until it is installed. A system `yt-dlp` only serves paths that explicitly use that system executable. CI skips this download because its checks do not exercise providers.

## Optional database visualizer

This is a separate app, not Prisma Studio. Keep it on a trusted local/private network and configure a unique admin password.

```bash
# Repository root
cp dev/db-visualizer/.env.example dev/db-visualizer/.env
# Edit the copied ADMIN_PASSWORD and DATABASE_URL.
cd dev/db-visualizer
npm ci
npx prisma generate
npm run dev -- --port 5555
```

The development Compose file also has a `visualizer` service. To use that container, set a unique `ADMIN_PASSWORD` in your root `.env` first, then start it with `docker compose -f docker-compose.dev.yml up -d visualizer`. It connects to the local Compose database. The example credentials are only for disposable local development.

## Package checks

```bash
# dev/frontend
npm run lint
npm run typecheck
npm test
npm run build

# dev/syncbeats-server, with DOTENV_CONFIG_PATH as above
npm run typecheck
npm test
npm run test:recommendations
npm run build

# dev/db-visualizer, with its local env configured
npm run lint
npm run typecheck
npm run build
```

CI installs from each lockfile and checks packages using disposable placeholder environment values. Prisma generation and builds do not require a running database. Do not interpret a passing build as a verified provider integration or synchronization measurement.

Lint is reported as advisory in CI while existing frontend and visualizer violations are addressed. Run it locally and avoid adding violations; type checks, automated tests and builds remain required CI steps.

`npm run test:recommendation-api` is a database integration test. It requires a separate, disposable **local** database named `syncbeats_recommendations_test`; the test refuses other database names and remote hosts. Set both `TEST_DATABASE_URL` and `DATABASE_URL` to that database, apply migrations with `npx prisma migrate deploy`, then run the command. Never reuse an application or production database. CI provides PostgreSQL 16 with this isolated database for the backend job.

For playback changes, open the same room in two browser tabs or devices. Check queue changes, play/pause/resume, seeking, late joins, and reconnects as relevant. Observe Socket.IO state and server logs; new participants may take several seconds to converge. Never post tokens or personal data with logs.
