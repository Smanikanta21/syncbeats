import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import prisma from '../db/prisma';
import { config } from '../config/config';

type AdminTable = 'users' | 'rooms' | 'devices' | 'room_participants';

const TABLES: AdminTable[] = ['users', 'rooms', 'devices', 'room_participants'];

function isAdminTable(input: string): input is AdminTable {
  return TABLES.includes(input as AdminTable);
}

function parseDate(value: unknown): Date | null {
  if (!value) return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : value ?? '';
}

function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const header = req.header('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Admin token missing' });
    return;
  }

  try {
    const decoded = jwt.verify(token, config.jwtSecret) as { role?: string };
    if (decoded.role !== 'admin') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired admin token' });
  }
}

function serializeUsers(rows: Awaited<ReturnType<typeof prisma.user.findMany>>) {
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    auth_provider: row.authProvider,
    email_verified_at: row.emailVerifiedAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
  }));
}

function serializeRooms(rows: Awaited<ReturnType<typeof prisma.room.findMany>>) {
  return rows.map((row) => ({
    id: row.id,
    host_id: row.hostId,
    track_url: row.trackUrl,
    playback_state: row.playbackState,
    position_ms: Number(row.positionMs),
    created_at: row.createdAt.toISOString(),
  }));
}

function serializeDevices(rows: Awaited<ReturnType<typeof prisma.device.findMany>>) {
  return rows.map((row) => ({
    id: row.id,
    user_id: row.userId,
    device_key: row.deviceKey,
    name: row.name,
    user_agent: row.userAgent,
    last_seen_at: row.lastSeenAt.toISOString(),
  }));
}

function serializeParticipants(rows: Awaited<ReturnType<typeof prisma.roomParticipant.findMany>>) {
  return rows.map((row) => ({
    id: `${row.roomId}::${row.userId}`,
    room_id: row.roomId,
    user_id: row.userId,
    socket_id: row.socketId,
    display_name: row.displayName,
    joined_at: row.joinedAt.toISOString(),
    left_at: row.leftAt?.toISOString() ?? null,
  }));
}

export function createAdminRoutes(): Router {
  const router = Router();

  router.post('/login', (req: Request, res: Response) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
      res.status(400).json({ error: 'email and password are required' });
      return;
    }

    if (email !== config.adminEmail || password !== config.adminPassword) {
      res.status(401).json({ error: 'Invalid admin credentials' });
      return;
    }

    const token = jwt.sign({ role: 'admin', email }, config.jwtSecret, { expiresIn: '12h' });
    res.json({ token, email, loginAt: new Date().toISOString() });
  });

  router.use(requireAdmin);

  router.get('/:table', async (req: Request, res: Response) => {
    const table = getParam(req.params.table);
    if (!isAdminTable(table)) {
      res.status(404).json({ error: 'Unknown table' });
      return;
    }

    try {
      if (table === 'users') {
        const rows = await prisma.user.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ rows: serializeUsers(rows) });
        return;
      }

      if (table === 'rooms') {
        const rows = await prisma.room.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ rows: serializeRooms(rows) });
        return;
      }

      if (table === 'devices') {
        const rows = await prisma.device.findMany({ orderBy: { createdAt: 'desc' } });
        res.json({ rows: serializeDevices(rows) });
        return;
      }

      const rows = await prisma.roomParticipant.findMany({ orderBy: { joinedAt: 'desc' } });
      res.json({ rows: serializeParticipants(rows) });
    } catch (err) {
      console.error('[Admin] list error:', err);
      res.status(500).json({ error: 'Failed to list rows' });
    }
  });

  router.post('/:table', async (req: Request, res: Response) => {
    const table = getParam(req.params.table);
    const payload = (req.body as { payload?: Record<string, unknown> }).payload ?? {};

    if (!isAdminTable(table)) {
      res.status(404).json({ error: 'Unknown table' });
      return;
    }

    try {
      if (table === 'users') {
        const created = await prisma.user.create({
          data: {
            name: String(payload.name ?? 'New User'),
            email: String(payload.email ?? ''),
            authProvider: String(payload.auth_provider ?? 'LOCAL'),
            emailVerifiedAt: parseDate(payload.email_verified_at),
            passwordHash: null,
          },
        });
        res.status(201).json({ row: serializeUsers([created])[0] });
        return;
      }

      if (table === 'rooms') {
        const created = await prisma.room.create({
          data: {
            id: String(payload.id ?? `R-${Date.now()}`),
            hostId: String(payload.host_id ?? ''),
            trackUrl: payload.track_url ? String(payload.track_url) : null,
            playbackState: String(payload.playback_state ?? 'IDLE'),
            positionMs: BigInt(Number(payload.position_ms ?? 0)),
          },
        });
        res.status(201).json({ row: serializeRooms([created])[0] });
        return;
      }

      if (table === 'devices') {
        const created = await prisma.device.create({
          data: {
            userId: String(payload.user_id ?? ''),
            deviceKey: String(payload.device_key ?? `device-${Date.now()}`),
            name: String(payload.name ?? 'New Device'),
            userAgent: payload.user_agent ? String(payload.user_agent) : null,
            lastSeenAt: parseDate(payload.last_seen_at) ?? new Date(),
          },
        });
        res.status(201).json({ row: serializeDevices([created])[0] });
        return;
      }

      const created = await prisma.roomParticipant.create({
        data: {
          roomId: String(payload.room_id ?? ''),
          userId: String(payload.user_id ?? ''),
          socketId: String(payload.socket_id ?? `sock-${Date.now()}`),
          displayName: String(payload.display_name ?? 'Guest'),
          joinedAt: parseDate(payload.joined_at) ?? new Date(),
          leftAt: parseDate(payload.left_at),
        },
      });
      res.status(201).json({ row: serializeParticipants([created])[0] });
    } catch (err) {
      console.error('[Admin] create error:', err);
      res.status(400).json({ error: 'Failed to create row' });
    }
  });

  router.patch('/:table/:id', async (req: Request, res: Response) => {
    const table = getParam(req.params.table);
    const id = getParam(req.params.id);
    const payload = (req.body as { payload?: Record<string, unknown> }).payload ?? {};

    if (!isAdminTable(table)) {
      res.status(404).json({ error: 'Unknown table' });
      return;
    }

    try {
      if (table === 'users') {
        const updated = await prisma.user.update({
          where: { id },
          data: {
            name: payload.name ? String(payload.name) : undefined,
            email: payload.email ? String(payload.email) : undefined,
            authProvider: payload.auth_provider ? String(payload.auth_provider) : undefined,
            emailVerifiedAt: Object.prototype.hasOwnProperty.call(payload, 'email_verified_at')
              ? parseDate(payload.email_verified_at)
              : undefined,
          },
        });
        res.json({ row: serializeUsers([updated])[0] });
        return;
      }

      if (table === 'rooms') {
        const updated = await prisma.room.update({
          where: { id },
          data: {
            hostId: payload.host_id ? String(payload.host_id) : undefined,
            trackUrl: Object.prototype.hasOwnProperty.call(payload, 'track_url')
              ? (payload.track_url ? String(payload.track_url) : null)
              : undefined,
            playbackState: payload.playback_state ? String(payload.playback_state) : undefined,
            positionMs: payload.position_ms != null ? BigInt(Number(payload.position_ms)) : undefined,
            endedAt: Object.prototype.hasOwnProperty.call(payload, 'ended_at')
              ? parseDate(payload.ended_at)
              : undefined,
          },
        });
        res.json({ row: serializeRooms([updated])[0] });
        return;
      }

      if (table === 'devices') {
        const updated = await prisma.device.update({
          where: { id },
          data: {
            userId: payload.user_id ? String(payload.user_id) : undefined,
            deviceKey: payload.device_key ? String(payload.device_key) : undefined,
            name: payload.name ? String(payload.name) : undefined,
            userAgent: Object.prototype.hasOwnProperty.call(payload, 'user_agent')
              ? (payload.user_agent ? String(payload.user_agent) : null)
              : undefined,
            lastSeenAt: payload.last_seen_at ? parseDate(payload.last_seen_at) ?? undefined : undefined,
          },
        });
        res.json({ row: serializeDevices([updated])[0] });
        return;
      }

      const [roomId, userId] = id.split('::');
      const updated = await prisma.roomParticipant.update({
        where: { roomId_userId: { roomId, userId } },
        data: {
          socketId: payload.socket_id ? String(payload.socket_id) : undefined,
          displayName: payload.display_name ? String(payload.display_name) : undefined,
          leftAt: Object.prototype.hasOwnProperty.call(payload, 'left_at') ? parseDate(payload.left_at) : undefined,
        },
      });
      res.json({ row: serializeParticipants([updated])[0] });
    } catch (err) {
      console.error('[Admin] update error:', err);
      res.status(400).json({ error: 'Failed to update row' });
    }
  });

  router.delete('/:table/:id', async (req: Request, res: Response) => {
    const table = getParam(req.params.table);
    const id = getParam(req.params.id);

    if (!isAdminTable(table)) {
      res.status(404).json({ error: 'Unknown table' });
      return;
    }

    try {
      if (table === 'users') {
        await prisma.user.delete({ where: { id } });
        res.json({ ok: true });
        return;
      }

      if (table === 'rooms') {
        await prisma.room.delete({ where: { id } });
        res.json({ ok: true });
        return;
      }

      if (table === 'devices') {
        await prisma.device.delete({ where: { id } });
        res.json({ ok: true });
        return;
      }

      const [roomId, userId] = id.split('::');
      await prisma.roomParticipant.delete({ where: { roomId_userId: { roomId, userId } } });
      res.json({ ok: true });
    } catch (err) {
      console.error('[Admin] delete error:', err);
      res.status(400).json({ error: 'Failed to delete row' });
    }
  });

  return router;
}
