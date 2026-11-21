import { RequestHandler } from 'express';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/AuthService';
import { randomUUID } from 'node:crypto';

const auth = new AuthService();
const channel = (userId: string) => `account-updates:${userId}`;

export function registerAccountUpdates(socket: Socket): void {
  let expiry: NodeJS.Timeout | undefined;
  let subscription = 0;
  socket.on('account:subscribe', async (payload: unknown, acknowledge?: (value: unknown) => void) => {
    const request = ++subscription;
    try {
      const supplied = payload && typeof payload === 'object' ? (payload as { token?: unknown }).token : undefined;
      const header = socket.handshake.headers.authorization;
      const token = typeof supplied === 'string' ? supplied : header?.startsWith('Bearer ') ? header.slice(7) : '';
      const verified = auth.verifyToken(token);
      if (!verified.sub || typeof verified.exp !== "number" || !Number.isFinite(verified.exp)) throw new Error('Invalid account session');
      if (expiry) clearTimeout(expiry);
      for (const room of socket.rooms) if (room.startsWith('account-updates:')) await socket.leave(room);
      if (subscription !== request || !socket.connected) return;
      await socket.join(channel(verified.sub));
      if (subscription !== request) { await socket.leave(channel(verified.sub)); return; }
      const expiresAt = verified.exp * 1000;
      const expire = () => {
        if (subscription !== request || !socket.connected) return;
        const remaining = expiresAt - Date.now();
        if (remaining > 0) { expiry = setTimeout(expire, Math.min(remaining, 2_147_483_647)); expiry.unref(); }
        else { void socket.leave(channel(verified.sub)); socket.emit('account:expired'); }
      };
      expire();
      acknowledge?.({ ok: true });
    } catch {
      if (subscription !== request) return;
      if (expiry) clearTimeout(expiry);
      for (const room of socket.rooms) if (room.startsWith('account-updates:')) await socket.leave(room);
      acknowledge?.({ ok: false });
    }
  });
  socket.on('disconnect', () => { if (expiry) clearTimeout(expiry); });
}

export const accountUpdateNotifications = (io: Server): RequestHandler => (req, res, next) => {
  res.once('finish', () => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || res.statusCode < 200 || res.statusCode >= 300 || !req.user?.sub) return;
    const path = req.originalUrl.split('?')[0];
    let kind: string | undefined;
    if (/^\/api\/playlists(?:\/|$)/.test(path) || /^\/spotify\/(import|my-playlists)/.test(path) || /^\/(api\/)?bridge\/songs\//.test(path) || path === '/api/bridge/resolve') kind = 'library';
    else if (path === '/auth/me' || /^\/users\/me(?:\/|$)/.test(path)) kind = 'profile';
    else if (/^\/devices(?:\/|$)/.test(path)) kind = 'devices';
    else if (/^\/recommendations\/(profile|events)/.test(path) || /^\/search\/interests/.test(path)) kind = 'interests';
    if (kind) io.to(channel(req.user.sub)).emit('account:changed', { kind, revision: randomUUID() });
  });
  next();
};
