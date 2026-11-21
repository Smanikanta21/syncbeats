import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  assert(url, 'TEST_DATABASE_URL must identify an isolated local test database');
  const parsed = new URL(url);
  assert(['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.pathname.includes('test'));
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = 'isolated-room-metadata-fixture';
  const [{ default: db }, { RoomManager }, { createRoomRoutes }] = await Promise.all([
    import('../db/prisma'), import('../core/RoomManager'), import('./RoomRoutes'),
  ]);
  const user = await db.user.create({ data: { email: `room-metadata-${randomUUID()}@example.invalid`, name: 'Fixture' } });
  const roomId = String(100000 + Math.floor(Math.random() * 900000));
  const app = express(), http = createServer(app), io = new Server(http);
  const manager = RoomManager.getInstance();
  const originalFetch = globalThis.fetch;
  let lookups = 0, checks = 0;
  const check = (ok: unknown, name: string) => { assert(ok, name); checks++; };
  globalThis.fetch = (async (input: any, init?: any) => {
    if (String(input).startsWith('https://www.youtube.com/oembed')) {
      lookups++; return new Response(JSON.stringify({ title: 'YouTube Artist - Video Title' }), { headers: { 'Content-Type': 'application/json' } });
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await db.room.create({ data: { id: roomId, hostId: user.id } });
    app.use(express.json()); app.use('/rooms', createRoomRoutes(manager, io));
    http.listen(0, '127.0.0.1'); await once(http, 'listening');
    const endpoint = `http://127.0.0.1:${(http.address() as any).port}/rooms/${roomId}/enqueue-youtube`;
    const token = jwt.sign({ sub: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '5m' });
    const enqueue = async (body: unknown) => {
      const res = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return { status: res.status, body: await res.json() as any };
    };
    const video = 'youtube:abcdefghijk';
    const youtube = await enqueue({ youtubeUrl: video });
    check(youtube.status === 201 && youtube.body.item.title === 'Video Title' && youtube.body.item.artist === 'YouTube Artist', 'Ordinary YouTube links still resolve and parse video metadata');
    const original = { youtubeUrl: video, title: 'Original Song - Reprise (Live)', artist: 'Original Artist', thumbnail: 'https://example.invalid/album.jpg', metadataSource: 'library' };
    const library = await enqueue(original);
    check(library.status === 201 && library.body.duplicate && library.body.item.id === youtube.body.item.id, 'Library selection enriches the same queued audio');
    check(library.body.item.title === original.title && library.body.item.artist === original.artist && library.body.item.thumbnail === original.thumbnail, 'Title punctuation, artist and album cover survive enqueue');
    check(lookups === 1, 'Canonical library metadata never triggers a YouTube title lookup');
    const repeat = await enqueue({ youtubeUrl: video, title: 'Replacement Video Title' });
    check(repeat.body.item.title === original.title, 'A later YouTube enqueue cannot replace library metadata');
    check((await enqueue({ ...original, youtubeUrl: 'youtube:bcdefghijkl', thumbnail: 'file:///private/album.jpg' })).status === 400, 'Non-shareable local artwork is rejected at the HTTP boundary');
    check((await enqueue({ ...original, title: [] })).status === 400, 'Invalid metadata receives a useful 400 response');
    const fresh = await enqueue({ ...original, youtubeUrl: 'youtube:bcdefghijkl', thumbnail: undefined });
    check(fresh.status === 201 && fresh.body.item.title === original.title, 'Missing artwork does not prevent queuing the original song');
    const longCover = 'https://example.invalid/album.jpg?token=' + 'a'.repeat(2200);
    const longArtwork = await enqueue({ ...original, thumbnail: longCover });
    check(longArtwork.status === 201 && longArtwork.body.item.thumbnail === longCover, 'Valid artwork URLs use the same 4096-character limit as library imports');
    console.log(`${checks} room metadata HTTP checks passed`);
  } finally {
    globalThis.fetch = originalFetch;
    manager.remove(roomId); await new Promise<void>(resolve => io.close(() => resolve()));
    await db.room.deleteMany({ where: { id: roomId, hostId: user.id } });
    await db.user.delete({ where: { id: user.id } }); await db.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
