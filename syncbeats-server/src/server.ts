// ─── SyncBeatsServer — Facade ─────────────────────────────────────────────
import 'dotenv/config';  // load .env before anything reads process.env

import express from 'express';
import http from 'http';
import cors from 'cors';
import { Server } from 'socket.io';
import { RoomManager } from './core/RoomManager';
import { SyncEngine } from './sync/SyncEngine';
import { SocketHandler } from './handlers/SocketHandler';
import { createRoomRoutes } from './handlers/RoomRoutes';
import { createAuthRoutes } from './handlers/AuthRoutes';
import { createDeviceRoutes } from './handlers/DeviceRoutes';
import { closePool } from './db/pool';
import { RoomRepository } from './db/RoomRepository';

export class SyncBeatsServer {
  private app = express();
  private httpServer = http.createServer(this.app);


  private io = new Server(this.httpServer, {
    cors: {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    },
  });

  private roomManager = RoomManager.getInstance();
  private syncEngine = new SyncEngine();
  private socketHandler: SocketHandler;

  constructor() {
    this.socketHandler = new SocketHandler(this.io, this.roomManager, this.syncEngine, new RoomRepository());
    this.setupMiddleware();
    this.setupRoutes();
    this.setupSocketIO();
    this.setupGracefulShutdown();
  }

  private setupMiddleware(): void {
    this.app.use(cors({
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    }));
    this.app.use(express.json());
  }

  private setupRoutes(): void {
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok', rooms: this.roomManager.list().length });
    });
    this.app.use('/auth', createAuthRoutes());
    this.app.use('/rooms', createRoomRoutes(this.roomManager));
    this.app.use('/devices', createDeviceRoutes());
  }

  private setupSocketIO(): void {
    this.io.on('connection', (socket) => {
      this.socketHandler.register(socket);
    });
  }

  private setupGracefulShutdown(): void {
    const shutdown = async (signal: string) => {
      console.log(`\n[Server] ${signal} received — shutting down gracefully`);
      this.httpServer.close(async () => {
        await closePool();
        console.log('[Server] Closed. Goodbye.');
        process.exit(0);
      });
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }

  start(): void {
    const port = parseInt(process.env.PORT || '4000', 10);
    this.httpServer.listen(port, () => {
      console.log(`\n🎵 SyncBeats server running on port ${port}`);
      console.log(`   Health:  http://localhost:${port}/health`);
      console.log(`   Auth:    http://localhost:${port}/auth`);
      console.log(`   Rooms:   http://localhost:${port}/rooms`);
      // console.log(`   CORS:    ${[`${process.env.CORS_ORIGIN}`, `${process.env.FRONTEND_CORS_ORIGIN}`].filter(Boolean).join(', ')}\n`);
    });
  }
}

const server = new SyncBeatsServer();
server.start();
