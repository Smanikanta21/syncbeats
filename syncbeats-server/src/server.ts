// ─── SyncBeatsServer — Facade ─────────────────────────────────────────────
import 'dotenv/config';

import express    from 'express';
import http       from 'http';
import cors       from 'cors';
import path       from 'path';
import fs         from 'fs';
import { Server } from 'socket.io';

import { config }              from './config/config';
import { RoomManager }         from './core/RoomManager';
import { SyncEngine }          from './sync/SyncEngine';
import { SocketHandler }       from './handlers/SocketHandler';
import { createRoomRoutes }    from './handlers/RoomRoutes';
import { createAuthRoutes }    from './handlers/AuthRoutes';
import { createDeviceRoutes }  from './handlers/DeviceRoutes';
import { createUploadRoutes }  from './handlers/UploadRoutes';
import prisma                  from './db/prisma';
import { RoomRepository }      from './db/RoomRepository';

export class SyncBeatsServer {
  private app        = express();
  private httpServer = http.createServer(this.app);
  private io         = new Server(this.httpServer, {
    cors: { origin: true, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'] },
  });

  private roomManager = RoomManager.getInstance();
  private syncEngine  = new SyncEngine();
  private socketHandler: SocketHandler;
  private roomRepo = new RoomRepository();

  constructor() {
    this.socketHandler = new SocketHandler(
      this.io, this.roomManager, this.syncEngine, this.roomRepo
    );
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupRoomCleanup();
    this.setupGracefulShutdown();
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: true, credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    }));
    this.app.use(express.json());

    // Serve uploaded audio files as static assets
    const uploadsDir = path.resolve(process.cwd(), 'uploads');
    if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
    this.app.use('/files', express.static(uploadsDir, {
      setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Accept-Ranges', 'bytes'); // needed for audio seeking
      },
    }));
  }

  private setupRoutes(): void {
    const baseUrl = `http://localhost:${config.port}`;

    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', rooms: this.roomManager.list().length });
    });
    this.app.use('/auth',    createAuthRoutes());
    this.app.use('/rooms',   createRoomRoutes(this.roomManager));
    this.app.use('/rooms',   createUploadRoutes(this.roomManager, baseUrl));
    this.app.use('/devices', createDeviceRoutes());
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      this.socketHandler.register(socket);
    });
  }

  private setupRoomCleanup(): void {
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

    const cleanup = async () => {
      try {
        const cutoff = new Date(Date.now() - ONE_DAY_MS);
        const candidates = await this.roomRepo.listOlderThan(cutoff);

        for (const room of candidates) {
          const liveRoom = this.roomManager.get(room.id);
          const hasParticipants = !!liveRoom && liveRoom.getParticipantCount() > 0;
          if (!hasParticipants) {
            await this.roomRepo.removeRoom(room.id);
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
    this.httpServer.listen(config.port, () => {
      console.log(`\n🎵 SyncBeats server running on port ${config.port}`);
      console.log(`   Health:  http://localhost:${config.port}/health`);
      console.log(`   Auth:    http://localhost:${config.port}/auth`);
      console.log(`   Rooms:   http://localhost:${config.port}/rooms`);
      console.log(`   Files:   http://localhost:${config.port}/files\n`);
    });
  }
}

const server = new SyncBeatsServer();
server.start();
