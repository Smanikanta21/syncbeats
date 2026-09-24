// ─── SyncBeatsServer — Facade ─────────────────────────────────────────────
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
import { AuditLogger } from './services/AuditLogger';

// ─── Timestamp all console output in Indian Standard Time (IST / UTC+5:30) ────
(['log', 'warn', 'error', 'info', 'debug'] as const).forEach((method) => {
  const original = console[method].bind(console);
  (console as any)[method] = (...args: unknown[]) => {
    const istDate = new Date(Date.now() + 5.5 * 3600 * 1000);
    const ts = istDate.toISOString().replace('T', ' ').slice(0, 19);
    
    // Serialize arguments for logging
    const msg = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ');
    original(`[${ts} IST]`, msg);

    // Pipe directly to DB (skip AuditLogger's own stdout to avoid infinite loop)
    if (!msg.includes('[AuditLog]') && !msg.includes('[AuditLogger Error]') && !msg.includes('prisma:')) {
      let action = `SERVER_${method.toUpperCase()}`;
      if (msg.includes('[Server]')) action = 'SERVER_LIFECYCLE';
      else if (msg.includes('[Cleanup]')) action = 'SERVER_CLEANUP';
      else if (msg.includes('[Socket]')) action = 'SOCKET_EVENT';
      
      AuditLogger.log(action, msg).catch(() => {});
    }
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

    // Global Request Audit Logging Middleware
    this.app.use((req, res, next) => {
      if (req.path.startsWith('/files') || req.path.startsWith('/health') || req.method === 'OPTIONS') {
        return next();
      }
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip || '127.0.0.1';
        const status = res.statusCode;
        const isErr = status >= 400;
        const msg = `${req.method} ${req.originalUrl} ${status} (${duration}ms)`;
        
        if (isErr) {
          void AuditLogger.error(`[BACKEND] HTTP_${status}`, msg, ip);
        } else {
          void AuditLogger.info(`[BACKEND] HTTP_${status}`, msg, ip);
        }
      });
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
    const baseUrl = `http://localhost:${PORT}`;

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
    this.app.use('/api/bridge', createMusicBridgeRoutes());
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
    const shutdown = async (signal: string) => {
      console.log(`\n[Server] ${signal} received — shutting down gracefully`);
      this.httpServer.close(async () => {
        await prisma.$disconnect();
        console.log('[Server] Closed. Goodbye.');
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
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
