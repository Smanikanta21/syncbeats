// ─── SyncBeatsServer — Facade ─────────────────────────────────────────────
import './instrument';
import * as Sentry from '@sentry/node';
import 'dotenv/config';
import express    from 'express';
import http       from 'http';
import cors       from 'cors';
import helmet     from 'helmet';
import path       from 'path';
import fs         from 'fs';
import { Server } from 'socket.io';

import { RoomManager }         from './core/RoomManager';
import { SocketHandler }       from './handlers/SocketHandler';

import { createRoomRoutes }    from './handlers/RoomRoutes';
import { createAuthRoutes }    from './handlers/AuthRoutes';
import { createDeviceRoutes } from './handlers/DeviceRoutes';
import { createSearchRoutes }  from './handlers/SearchRoutes';
import { createYoutubeRoutes } from './handlers/YoutubeRoutes';
import { createHistoryRoutes } from './handlers/HistoryRoutes';
import { createSpotifyRoutes } from './handlers/SpotifyRoutes';
import { createMusicBridgeRoutes } from './handlers/MusicBridgeRoutes';
import playlistRoutes from './handlers/PlaylistRoutes';
import { createUserRoutes } from './handlers/UserRoutes';
import { createFeedbackRoutes } from './handlers/FeedbackRoutes';
import { createTelemetryRoutes } from './handlers/TelemetryRoutes';
import { UserRepository } from './auth/UserRepository';
import prisma                  from './db/prisma';
import { RoomRepository }      from './db/RoomRepository';

import { createAdapter } from '@socket.io/redis-adapter';
import { createClient }  from 'redis';
import { notFoundHandler, errorHandler, isInternalError, logErrorToFile } from './utils/errorHandler';
import { safeStringify } from './utils/errorLogger';

// ─── Timestamp all console output in Indian Standard Time (IST / UTC+5:30) ────
(['log', 'warn', 'error', 'info', 'debug'] as const).forEach((method) => {
  const original = console[method].bind(console);
  (console as any)[method] = (...args: unknown[]) => {
    const istDate = new Date(Date.now() + 5.5 * 3600 * 1000);
    const ts = istDate.toISOString().replace('T', ' ').slice(0, 19);

    // Serialize arguments for logging. Must never throw: this wrapper runs inside
    // catch blocks, where a circular req object would turn logging into a crash.
    const msg = args.map(arg =>
      typeof arg === 'object' && arg !== null ? safeStringify(arg) : String(arg)
    ).join(' ');
    original(`[${ts} IST]`, msg);
  };
});

const PORT = parseInt(process.env.PORT ?? '4000', 10);
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000';
const VERCEL_FALLBACK_URL = process.env.VERCEL_FALLBACK_URL || 'https://your-app-name.vercel.app';

const isAllowedOrigin = (origin: string | undefined): boolean => {
  if (!origin) return true;
  if (process.env.NODE_ENV?.toLowerCase() === 'development') return true;
  if (FRONTEND_URL && origin === FRONTEND_URL) return true;
  if (VERCEL_FALLBACK_URL && origin === VERCEL_FALLBACK_URL) return true;
  if (origin.includes('syncbeats.app') || origin.includes('syncbeats.in')) return true;
  if (origin.endsWith('.vercel.app') || origin.includes('vercel.app')) return true;
  if (origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:')) return true;
  return false;
};

export class SyncBeatsServer {
  private app        = express();
  private httpServer = http.createServer(this.app);
  private io         = new Server(this.httpServer, {
    cors: { 
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true, 
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'X-Device-Id', 'Accept', 'Range']
    },
    transports: ['polling', 'websocket'],
  });

  private roomManager = RoomManager.getInstance();
  private socketHandler: SocketHandler;
  private roomRepo = new RoomRepository();

  constructor() {
    this.socketHandler = new SocketHandler(
      this.io, this.roomManager, this.roomRepo
    );
    this.app.set('io', this.io);
    this.setupMiddleware();
    this.setupRoutes();
    this.setupRedisAdapter();
    this.setupSocketIO();
    this.setupRoomCleanup();
    this.setupGracefulShutdown();
  }

  private async setupRedisAdapter() {
    if (process.env.REDIS_URL) {
      const pubClient = createClient({ url: process.env.REDIS_URL });
      const subClient = pubClient.duplicate();
      try {
        await Promise.all([pubClient.connect(), subClient.connect()]);
        this.io.adapter(createAdapter(pubClient, subClient));
        console.log('[Server] Redis adapter enabled for Socket.IO scaling');
      } catch (err) {
        console.error('[Server] Failed to connect to Redis', err);
      }
    }
  }

  private setupMiddleware(): void {
    this.app.set('trust proxy', 1);

    // Basic security headers
    this.app.use(helmet({
      crossOriginResourcePolicy: false, // Allow fetching media across origins (like AudioContext)
    }));

    const corsOptions: cors.CorsOptions = {
      origin: (origin, callback) => {
        if (isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(null, false);
        }
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-device-id', 'X-Device-Id', 'Accept', 'Range'],
      optionsSuccessStatus: 200,
    };

    this.app.use(cors(corsOptions));
    this.app.use(express.json());

    // ── Leakage Protection Interceptor ──────────────────────────────────────
    // Guarantees that internal errors (Prisma, database schemas, stack traces)
    // NEVER reach clients even if a handler inadvertently responds with raw err.message.
    // Intercepted errors are translated, logged to logs/error.log with clear human-readable
    // diagnostics and suggested fixes, and replaced with safe, user-facing messages.
    this.app.use((req, res, next) => {
      const originalJson = res.json.bind(res);
      const originalSend = res.send.bind(res);

      res.json = function (body: any) {
        if (body && typeof body === 'object') {
          // Check every field a client could read — handlers routinely put the
          // human sentence in `error` and the raw one in `details`/`message`.
          const textFields = ['error', 'message', 'details', 'stack', 'trace'] as const;
          const leaking = textFields.filter(f => f in body && isInternalError(body[f]));

          if (leaking.length > 0) {
            const candidate = body[leaking[0]];
            const explanation = logErrorToFile(candidate, {
              method: req.method,
              url: req.originalUrl || req.url,
              ip: req.ip,
              userId: (req as any)?.user?.sub,
              userEmail: (req as any)?.user?.email,
              body: req.body,
              source: `Response Sanitize Interceptor: ${req.method} ${req.originalUrl || req.url}`,
            });

            // Replace the readable field, drop the diagnostic ones outright.
            if (body.error !== undefined) body.error = explanation.userFacingMessage;
            else body.message = explanation.userFacingMessage;
            delete body.details;
            delete body.stack;
            delete body.trace;

            // Only our own faults become a 5xx — P2002/P2025 stay a deliberate 4xx.
            if (explanation.isInternal && res.statusCode < 500) {
              res.status(500);
            }
          }
        }
        return originalJson(body);
      };

      res.send = function (data: any) {
        if (typeof data === 'string' && isInternalError(data)) {
          const explanation = logErrorToFile(data, {
            method: req.method,
            url: req.originalUrl || req.url,
            ip: req.ip,
            source: `Response Sanitize Interceptor (send): ${req.method} ${req.originalUrl || req.url}`,
          });
          if (res.statusCode < 500) {
            res.status(500);
          }
          return originalJson({ error: explanation.userFacingMessage });
        }
        return originalSend(data);
      };

      next();
    });

    // Serve uploaded audio files with proper HTTP byte-range streaming.
    // express.static advertises Accept-Ranges but doesn't implement partial content
    // (206) responses — which browsers require for audio seeking and mid-file joins.
    // Without this, 3 devices all buffering simultaneously stall each other.
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

    this.app.get('/files/:filename', (req, res) => {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(uploadsDir, filename);

      if (!fs.existsSync(filePath)) { res.status(404).end(); return; }

      const stat = fs.statSync(filePath);
      const total = stat.size;
      const rangeHeader = req.headers['range'];

      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', 'audio/mpeg');

      if (rangeHeader) {
        // Parse e.g. "bytes=1048576-2097151"
        const [startStr, endStr] = rangeHeader.replace('bytes=', '').split('-');
        const start = parseInt(startStr, 10);
        // Instead of capping at 1MB chunks, we stream the rest of the file.
        // This stops the browser from making dozens of mid-song HTTP requests
        // which completely freezes the dev server when 3+ phones do it at once. 
        const end   = endStr ? parseInt(endStr, 10) : total - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range':  `bytes ${start}-${end}/${total}`,
          'Content-Length': chunkSize,
        });

        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        // Full file request (first load / small files)
        res.writeHead(200, { 'Content-Length': total });
        fs.createReadStream(filePath).pipe(res);
      }
    });
  }

  private setupRoutes(): void {

    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', rooms: this.roomManager.list().length });
    });
    this.app.use('/auth',    createAuthRoutes());

    const userRepository = new UserRepository();
    this.app.use('/users',   createUserRoutes(userRepository));

    this.app.use('/rooms',   createRoomRoutes(this.roomManager, this.io));
    this.app.use('/devices', createDeviceRoutes());
    this.app.use('/search',  createSearchRoutes());
    this.app.use('/youtube', createYoutubeRoutes());
    this.app.use('/history', createHistoryRoutes(prisma));
    this.app.use('/spotify', createSpotifyRoutes());
    this.app.use('/bridge', createMusicBridgeRoutes());
    this.app.use('/api/bridge', createMusicBridgeRoutes());
    this.app.use('/playlists', playlistRoutes);
    this.app.use('/api/playlists', playlistRoutes);
    this.app.use('/feedback', createFeedbackRoutes());
    this.app.use('/telemetry', createTelemetryRoutes());

    // ── CLI install route ──────────────────────────────────────────────────
    this.app.get('/cli', (_req, res) => {
      const installScript = `#!/bin/bash
# SyncBeats Terminal Player - Auto Installer & Launcher
set -e

echo ""
echo "SyncBeats Terminal Player Installer"
echo "======================================="
echo ""

# 1. Check OS (macOS and Linux only)
OS="$(uname -s)"
if [ "$OS" != "Darwin" ] && [ "$OS" != "Linux" ]; then
  echo "Error: Only macOS and Linux are supported."
  exit 1
fi

# 2. Check and auto-install dependencies
for cmd in node npm git ffplay; do
  if ! command -v $cmd &> /dev/null; then
    if [ "$cmd" = "ffplay" ]; then
      echo "Missing dependency: ffplay (ffmpeg). Attempting to auto-install..."
      if [ "$OS" = "Darwin" ] && command -v brew &> /dev/null; then
        echo "Running: brew install ffmpeg"
        brew install ffmpeg
      elif [ "$OS" = "Linux" ] && command -v apt-get &> /dev/null; then
        echo "Running: sudo apt-get update && sudo apt-get install -y ffmpeg"
        sudo apt-get update && sudo apt-get install -y ffmpeg
      else
        echo "Could not auto-install ffmpeg. Please install manually:"
        echo "  macOS: brew install ffmpeg"
        echo "  Linux: sudo apt install ffmpeg"
        exit 1
      fi
    else
      echo "Missing dependency: $cmd"
      if [ "$cmd" = "node" ] || [ "$cmd" = "npm" ]; then
        echo "  Install Node.js: https://nodejs.org (v18+ required)"
      fi
      exit 1
    fi
  fi
done

# 3. Clone or update repository
INSTALL_DIR="$HOME/.syncbeats-terminal"
if [ -d "$INSTALL_DIR" ]; then
  echo "Updating existing installation..."
  cd "$INSTALL_DIR" && git reset --hard HEAD && git pull origin main
else
  echo "Cloning SyncBeats Terminal Player..."
  git clone https://github.com/Smanikanta21/CLI-music-player.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

echo "Installing dependencies..."
npm install

echo "Building..."
npm run build

chmod +x "$INSTALL_DIR/bin/index.js"

# 4. Automatically add 'syncbeats' command to system
if [ -w "/usr/local/bin" ]; then
  ln -sf "$INSTALL_DIR/bin/index.js" /usr/local/bin/syncbeats
fi

# Auto-append alias to ~/.zshrc and ~/.bashrc so 'syncbeats' works anywhere
for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
  if [ -f "$rc" ] && ! grep -q "alias syncbeats=" "$rc" 2>/dev/null; then
    printf '\\nalias syncbeats="node %s/bin/index.js"\\n' "$INSTALL_DIR" >> "$rc"
  fi
done

echo ""
echo "Installation complete!"
echo "'syncbeats' command is now registered."
echo "Launching SyncBeats Terminal..."
echo ""

# 5. Open instantly in the terminal
if [ -r /dev/tty ]; then
  node "$INSTALL_DIR/bin/index.js" < /dev/tty
else
  node "$INSTALL_DIR/bin/index.js"
fi
`;
      res.setHeader('Content-Type', 'text/plain');
      res.send(installScript);
    });

    this.app.get('/cli/info', (_req, res) => {
      res.json({
        name: 'SyncBeats Terminal Player',
        version: '1.0.0',
        platforms: ['macOS', 'Linux'],
        repository: 'https://github.com/Smanikanta21/CLI-music-player',
        requirements: {
          node: '>=18.0.0',
          ffplay: 'Required (part of ffmpeg)',
        },
        install: 'curl -fsSL https://syncbeats-server-1006171035854.asia-south1.run.app/cli | bash',
        description: 'A terminal-based music player that syncs playback across devices in real-time using SyncBeats rooms.',
      });
    });

    // Must stay last: unknown paths answer with JSON, and anything a handler threw
    // (including async rejections, which Express 5 forwards here) becomes a written
    // message instead of Express's default HTML error page.
    Sentry.setupExpressErrorHandler(this.app);
    this.app.use(notFoundHandler);
    this.app.use(errorHandler);
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      this.socketHandler.register(socket);
    });
  }

  private setupRoomCleanup(): void {
    // Rooms expire 60 days after their last access (timer resets on every join)
    const TWO_MONTHS_MS = 60 * 24 * 60 * 60 * 1000;
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // run every hour

    const cleanup = async () => {
      try {
        const cutoff = new Date(Date.now() - TWO_MONTHS_MS);
        const candidates = await this.roomRepo.listOlderThan(cutoff);

        for (const room of candidates) {
          const liveRoom = this.roomManager.get(room.id);
          const hasParticipants = !!liveRoom && liveRoom.getParticipantCount() > 0;
          if (!hasParticipants) {
            console.log(`[Cleanup] Removed stale empty room ${room.id}`);
          }
        }
      } catch (err) {
        console.error('[Cleanup] room cleanup failed:', err);
      }
    };

    void cleanup();
    setInterval(() => { void cleanup(); }, CLEANUP_INTERVAL_MS);
  }

  private setupGracefulShutdown(): void {
    let shuttingDown = false;
    const shutdown = async (signal: string) => {
      if (shuttingDown) return;
      shuttingDown = true;
      console.log('[Server] ' + signal + ' received — shutting down gracefully');
      const deadline = setTimeout(() => {
        console.error('[Server] Shutdown exceeded 10 seconds; pending writes may not be durable.');
        process.exit(1);
      }, 10_000);
      deadline.unref();
      try {
        // Disconnect sockets first so their final paused state joins the persistence queue.
        await new Promise<void>(resolve => this.io.close(() => resolve()));
        await this.socketHandler.flushPersistence();
        await prisma.$disconnect();
        clearTimeout(deadline);
        console.log('[Server] Closed. Goodbye.');
        process.exit(0);
      } catch (error) {
        console.error('[Server] Could not flush room state during shutdown:', error);
        process.exit(1);
      }
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason) => {
      logErrorToFile(reason, { source: 'Process: unhandledRejection' });
      console.error('[Process] Unhandled promise rejection:', reason);
    });

    process.on('uncaughtException', (err) => {
      logErrorToFile(err, { source: 'Process: uncaughtException' });
      console.error('[Process] Uncaught exception:', err);
    });
  }

  start(): void {
    this.httpServer.listen(PORT, () => {
      console.log(`[Server] SyncBeats server running on port: ${process.env.NODE_ENV === 'Production' ? 'syncbeats.in/api' : `

        |-----------------------------|
        | 'http://localhost:${PORT}'
        |-----------------------------|`}`);
    });
  }
}

const server = new SyncBeatsServer();
server.start();
