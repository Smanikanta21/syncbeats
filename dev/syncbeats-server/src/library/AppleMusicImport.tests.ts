import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
const { io: connect } = require('../../../frontend/node_modules/socket.io-client');

async function main() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL must name an isolated local test database');
  const parsed = new URL(url);
  assert(['localhost', '127.0.0.1'].includes(parsed.hostname) && parsed.pathname.includes('test'), 'Refusing a non-local or non-test database');
  process.env.DATABASE_URL = url;
  process.env.JWT_SECRET = 'isolated-apple-import-fixture-secret';
  const [{ default: routes }, updates] = await Promise.all([
    import('../handlers/PlaylistRoutes'), import('./AccountUpdates')
  ]);
  const db = new PrismaClient({ datasources: { db: { url } } });
  const suffix = randomUUID();
  const users = await Promise.all(['alice', 'bob'].map(name => db.user.create({ data: { email: `${name}-${suffix}@example.invalid`, name } })));
  const app = express(); const http = createServer(app); const io = new Server(http);
  io.on('connection', socket => updates.registerAccountUpdates(socket));
  app.use(express.json()); app.use(updates.accountUpdateNotifications(io)); app.use('/api/playlists', routes);
  http.listen(0, '127.0.0.1'); await once(http, 'listening');
  const base = `http://127.0.0.1:${(http.address() as any).port}`;
  const tokens = users.map(u => jwt.sign({ sub: u.id, email: u.email }, process.env.JWT_SECRET!, { expiresIn: '10m' }));
  const sockets: any[] = []; const notices: any[][] = [[], []]; let checks = 0;
  const check = (ok: unknown, name: string) => { assert(ok, name); checks++; };
  const call = async (path: string, method = 'GET', body?: unknown, token: string | null = tokens[0]) => {
    const response = await fetch(base + path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() as any };
  };
  const endpoint = '/api/playlists/apple-music/import';
  const track = (index: number) => ({ sourceId: `i.${index}`, title: `Apple ${suffix} ${index}`, artist: 'Fixture artist', album: 'Fixture album', albumArt: 'https://example.invalid/cover.jpg', duration: 193 });
  const payload = { sourceId: 'p.fixture', name: 'Apple collection', coverUrl: 'https://example.invalid/list.jpg', tracks: [track(0), track(1)] };
  try {
    for (let i = 0; i < 2; i++) {
      const socket = connect(base, { transports: ['websocket'], forceNew: true }); sockets.push(socket);
      socket.on('account:changed', (notice: any) => notices[i].push(notice)); await once(socket, 'connect');
      await new Promise<void>(resolve => socket.emit('account:subscribe', { token: tokens[i] }, (result: any) => { assert.equal(result.ok, true); resolve(); }));
    }
    check((await call(endpoint, 'GET', undefined, null)).status === 401, 'Capabilities require authentication');
    check((await call(endpoint, 'POST', payload, null)).status === 401, 'Import requires authentication');
    check((await call(endpoint)).body.maxTracks === 100, 'Server advertises bounded batches');
    const imported = await call(endpoint, 'POST', payload);
    check(imported.status === 200 && imported.body.added === 2 && imported.body.processed === 2, 'Import acknowledges committed metadata');
    const id = imported.body.playlistId;
    const original = await db.playlist.findUniqueOrThrow({ where: { id }, include: { tracks: { include: { song: true }, orderBy: { position: 'asc' } } } });
    check(original.userId === users[0].id && original.sourceType === 'APPLE_MUSIC' && original.sourceId === payload.sourceId, 'Playlist belongs to the authenticated account');
    check(original.tracks[0].sourceId === 'i.0' && original.tracks[0].song?.album === 'Fixture album' && original.tracks[0].song?.duration === 193 && original.tracks[0].song?.albumArt === payload.tracks[0].albumArt, 'Stable identity, album, artwork and duration reach the database');
    await new Promise(resolve => setTimeout(resolve, 80));
    check(notices[0].some(n => n.kind === 'library') && notices[1].length === 0, 'Only the account devices receive library invalidations');
    const retry = await call(endpoint, 'POST', payload);
    check(retry.body.playlistId === id && retry.body.added === 0 && retry.body.trackCount === 2, 'Repeated import is idempotent');
    const concurrent = await Promise.all([call(endpoint, 'POST', payload), call(endpoint, 'POST', payload)]);
    check(concurrent.every(r => r.status === 200 && r.body.playlistId === id && r.body.added === 0), 'Concurrent retries do not duplicate collections');
    const bob = await call(endpoint, 'POST', payload, tokens[1]);
    check(bob.body.playlistId !== id, 'Identical Apple IDs on another account create separate collections');
    check((await call(`/api/playlists/${id}`, 'GET', undefined, tokens[1])).status === 404, 'Another account cannot read the imported collection');
    await db.playlist.update({ where: { id }, data: { name: 'My edited name' } });
    await db.playlistTrack.update({ where: { id: original.tracks[0].id }, data: { youtubeId: 'AAAAAAAAAAA' } });
    await db.song.update({ where: { id: original.tracks[0].songId! }, data: { youtubeId: 'AAAAAAAAAAA' } });
    await db.playlistTrack.create({ data: { playlistId: id, title: `Manual ${suffix}`, artist: '', position: 2, youtubeId: 'BBBBBBBBBBB' } });
    const changed = await call(endpoint, 'POST', { ...payload, tracks: [{ ...track(0), album: 'Updated album', title: `Corrected ${suffix}` }, track(2)] });
    const after = await db.playlist.findUniqueOrThrow({ where: { id }, include: { tracks: true } });
    check(changed.body.name === 'My edited name' && after.tracks.length === 4, 'Re-import preserves edited names, manual additions and previously imported songs');
    const first = after.tracks.find(t => t.sourceId === 'i.0')!;
    check(first.id === original.tracks[0].id && first.youtubeId === 'AAAAAAAAAAA' && first.title === `Corrected ${suffix}`, 'Metadata updates preserve stable track identity and known playback resolution');
    const catalog = await call('/api/playlists/catalog?view=songs&limit=60');
    const song = catalog.body.songs.find((s: any) => s.title === `Corrected ${suffix}`);
    check(song?.source === 'APPLE_MUSIC' && song.sourceSongID && song.artwork === track(0).albumArt, 'Shared catalog exposes imported metadata, artwork and Song identity');
    check((await call('/api/playlists/catalog?view=albums&limit=60')).body.groups.some((g: any) => g.album === 'Updated album'), 'Imported albums appear in account catalog');
    const coverBatch = await call(endpoint, 'POST', { sourceId: 'p.cover-fixture', name: 'Cover fixtures', tracks: [
      { ...track(10000), title: 'A missing cover', artist: 'Cover fixture artist', album: 'Cover fixture album', albumArt: undefined },
      { ...track(10001), title: 'Z available cover', artist: 'Cover fixture artist', album: 'Cover fixture album', albumArt: 'https://example.invalid/later-cover.jpg' },
    ] });
    check(coverBatch.status === 200, 'Artwork preview fixture imports without requiring every song to have a cover');
    for (const view of ['albums', 'artists']) {
      const groups = (await call(`/api/playlists/catalog?view=${view}&limit=60`)).body.groups;
      const group = groups.find((g: any) => g.artist === 'Cover fixture artist');
      check(group?.preview?.artwork === 'https://example.invalid/later-cover.jpg', `${view} preview prefers available artwork over the first alphabetical song`);
    }
    const count = await db.playlist.count({ where: { userId: users[0].id } });
    for (const bad of [
      { ...payload, sourceId: 'invalid', tracks: Array.from({ length: 101 }, (_, i) => track(i)) },
      { ...payload, sourceId: 'invalid', tracks: [{ ...track(8), albumArt: 'file:///secret' }] },
      { ...payload, sourceId: 'invalid', tracks: [track(8), { ...track(8), title: 'conflict' }] },
      { ...payload, sourceId: 'invalid', tracks: [{ ...track(8), duration: -1 }] },
      { ...payload, sourceId: 'invalid', tracks: [{ title: 'No identity' }] }
    ]) check((await call(endpoint, 'POST', bad)).status === 400, 'Invalid batches reject before writes');
    check(await db.playlist.count({ where: { userId: users[0].id } }) === count, 'Rejected batches leave no partial playlist');
    const bulk = { sourceId: 'p.bulk', name: 'Large collection', tracks: Array.from({ length: 100 }, (_, i) => track(i + 100)) };
    const batch1 = await call(endpoint, 'POST', bulk);
    const batch2 = await call(endpoint, 'POST', { ...bulk, tracks: Array.from({ length: 25 }, (_, i) => track(i + 200)) });
    check(batch1.status === 200 && batch2.body.trackCount === 125, 'Successive bounded batches build a larger playlist');
    check((await call(endpoint, 'POST', bulk)).body.trackCount === 125, 'Retrying an acknowledged chunk preserves later batches');
    check(await db.playlist.count({ where: { userId: users[0].id, sourceId: 'p.fixture' } }) === 1, 'One account collection remains per source identity');
    console.log(`${checks} Apple Music database import checks passed`);
  } finally {
    sockets.forEach(s => s.disconnect()); await new Promise<void>(resolve => io.close(() => resolve()));
    await db.user.deleteMany({ where: { id: { in: users.map(u => u.id) } } });
    await db.song.deleteMany({ where: { title: { contains: suffix } } });
    await db.$disconnect(); const { default: serviceDB } = await import('../db/prisma'); await serviceDB.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
