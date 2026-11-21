import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { PrismaClient } from '@prisma/client';

async function main() {
  const raw = process.env.TEST_DATABASE_URL;
  if (!raw) throw new Error('TEST_DATABASE_URL must point to the isolated local playlist test database.');
  const url = new URL(raw);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/syncbeats_playlist_test') throw new Error('Refusing to run outside syncbeats_playlist_test on localhost.');
  process.env.DATABASE_URL = raw;
  process.env.JWT_SECRET = 'isolated-playlist-test-secret';
  const { default: routes } = await import('../handlers/PlaylistRoutes');
  const { sameTrack } = await import('./PlaylistManagement');
  const db = new PrismaClient();
  const suffix = randomUUID();
  const alice = await db.user.create({ data: { name: 'Playlist fixture', email: `playlist-${suffix}@example.test` } });
  const bob = await db.user.create({ data: { name: 'Other account fixture', email: `other-${suffix}@example.test` } });
  const token = (id: string) => jwt.sign({ sub: id }, process.env.JWT_SECRET!, { expiresIn: '10m' });
  const { registerAccountUpdates, accountUpdateNotifications } = await import('./AccountUpdates');
  const app = express(); app.use(express.json());
  const server = createServer(app);
  const io = new Server(server);
  io.on('connection', registerAccountUpdates);
  app.use(accountUpdateNotifications(io)); app.use('/api/playlists', routes);
  server.listen(0);
  const { io: client } = require('../../../frontend/node_modules/socket.io-client');
  const clients: any[] = [];
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  let checks = 0;
  const check = (value: unknown, name: string) => { assert.ok(value, name); checks++; console.log('PASS:', name); };
  const request = async (path: string, method = 'GET', body?: unknown, user = alice.id) => {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/playlists${path}`, { method, headers: { Authorization: `Bearer ${token(user)}`, 'Content-Type': 'application/json' }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    return { status: response.status, body: await response.json() as any };
  };
  try {
    const playlist = await db.playlist.create({ data: { userId: alice.id, name: 'Editable' } });
    check((await request(`/${playlist.id}/management`)).body.version === 1, 'New deletion contract is discoverable before mutation');
    check((await request(`/${playlist.id}`, 'PUT', { name: '  Evening collection  ' })).body.playlist.name === 'Evening collection', 'Rename persists a trimmed name');
    check((await request(`/${playlist.id}`, 'PUT', { name: ' ' })).status === 400, 'Blank names are rejected');
    check((await request(`/${playlist.id}`, 'PUT', { name: 'Liked Songs' })).status === 400, 'The Library collection name is reserved');
    check((await request(`/${playlist.id}`, 'PUT', { name: 'Wrong account' }, bob.id)).status === 404, 'Another account cannot rename a playlist');
    const tracks = [
      { title: `First ${suffix}`, artist: 'Fixture artist', youtubeId: 'abcdefghijk', album: 'Real fixture metadata', albumArt: 'https://example.test/art.jpg', duration: 120 },
      { title: `Apple-only ${suffix}`, artist: 'Fixture artist', album: 'Imported fixture', albumArt: 'https://example.test/apple.jpg', duration: 180 },
    ];
    const added = await request(`/${playlist.id}/tracks/batch`, 'POST', { tracks: [...tracks, tracks[0]] });
    check(added.status === 200 && added.body.added === 2 && added.body.playlist.tracks.length === 2, 'Atomic song selection adds distinct songs in order');
    check(added.body.playlist.tracks[1].song.album === 'Imported fixture' && !added.body.playlist.tracks[1].youtubeId, 'Apple Music metadata is retained without matching or playing');
    check((await request(`/${playlist.id}/tracks/batch`, 'POST', { tracks })).body.added === 0, 'Repeated song selection does not duplicate tracks');
    check((await request(`/${playlist.id}/tracks/batch`, 'POST', { tracks }, bob.id)).status === 404, 'Another account cannot add songs');
    const before = await db.playlistTrack.count({ where: { playlistId: playlist.id } });
    check((await request(`/${playlist.id}/tracks/batch`, 'POST', { tracks: [tracks[0], { title: 'Invalid', youtubeId: 'bad' }] })).status === 400 && await db.playlistTrack.count({ where: { playlistId: playlist.id } }) === before, 'Invalid batch selections leave the playlist unchanged');
    check((await request(`/${playlist.id}`, 'DELETE', { songDisposition: 'invalid' })).status === 400 && !!await db.playlist.findUnique({ where: { id: playlist.id } }), 'An invalid delete choice cannot remove data');
    check((await request(`/${playlist.id}`, 'DELETE', { songDisposition: 'remove' }, bob.id)).status === 404, 'Another account cannot delete a playlist');
    const catalogIDs = added.body.playlist.tracks.map((track: any) => track.songId) as string[];
    const kept = await request(`/${playlist.id}`, 'DELETE', { songDisposition: 'keep' });
    check(kept.status === 200 && kept.body.library.tracks.length === 2 && !await db.playlist.findUnique({ where: { id: playlist.id } }), 'Delete playlist only atomically keeps its songs in Library');
    const liked = kept.body.library.id as string;
    const removing = await db.playlist.create({ data: { userId: alice.id, name: 'Remove with songs' } });
    const shared = await db.playlist.create({ data: { userId: alice.id, name: 'Shared songs stay' } });
    await request(`/${removing.id}/tracks/batch`, 'POST', { tracks });
    await request(`/${shared.id}/tracks/batch`, 'POST', { tracks: [tracks[0]] });
    const other = await db.playlist.create({ data: { userId: bob.id, name: 'Other user collection' } });
    const keptTracks = await db.playlistTrack.findMany({ where: { playlistId: liked } });
    const live = await db.playlist.create({ data: { userId: alice.id, name: 'Live fixture', tracks: { create: keptTracks.map(t => ({ title: t.title, artist: t.artist, youtubeId: t.youtubeId, songId: t.songId, thumbnail: t.thumbnail })) } } });
    const origin = `http://127.0.0.1:${address.port}`;
    async function connect(id: string, suppliedToken = token(id)) {
      const socket = client(origin, { transports: ['websocket'], autoConnect: false }); clients.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', resolve); socket.once('connect_error', reject); socket.connect();
      });
      const ack = await new Promise<any>(resolve => socket.emit('account:subscribe', { token: suppliedToken, userId: alice.id }, resolve));
      return { socket, ack };
    }
    const firstConnection = await connect(alice.id), second = await connect(alice.id), outsider = await connect(bob.id);
    check(firstConnection.ack.ok && second.ack.ok && outsider.ack.ok, 'Same-account clients can subscribe with verified tokens');
    const forged = await connect(alice.id, 'invalid-token');
    check(!forged.ack.ok, 'Forged account subscriptions are rejected');
    const expired = await connect(alice.id, jwt.sign({ sub: alice.id }, process.env.JWT_SECRET!, { expiresIn: -1 }));
    check(!expired.ack.ok, 'Expired account subscriptions are rejected');
    let ownEvents = 0, otherEvents = 0, forgedEvents = 0;
    second.socket.on('account:changed', (event: any) => { if (event.kind === 'library') ownEvents++; });
    outsider.socket.on('account:changed', () => otherEvents++);
    forged.socket.on('account:changed', () => forgedEvents++);
    await request(`/${live.id}`, 'PUT', { name: 'Live change' });
    await new Promise(resolve => setTimeout(resolve, 80));
    check(ownEvents === 1 && otherEvents === 0 && forgedEvents === 0, 'A mutation instantly invalidates only the verified owning account');
    await request(`/${live.id}`, 'PUT', { name: '' });
    await new Promise(resolve => setTimeout(resolve, 40));
    check(ownEvents === 1, 'Rejected mutations do not emit invalidations');
    const index = await request('?limit=1');
    check(index.status === 200 && index.body.playlists.length === 1 && index.body.nextCursor, 'Playlist metadata is paginated');
    check(!('tracks' in index.body.playlists[0]) && Number.isInteger(index.body.playlists[0].trackCount), 'Index excludes track arrays and includes accurate counts');
    const trackPage = await request(`/${live.id}/tracks?limit=1`);
    check(trackPage.status === 200 && trackPage.body.playlist.tracks.length === 1 && trackPage.body.nextCursor, 'Playlist songs load lazily in ordered pages');
    const nextTracks = await request(`/${live.id}/tracks?limit=1&cursor=${trackPage.body.nextCursor}`);
    check(nextTracks.body.playlist.tracks[0].id !== trackPage.body.playlist.tracks[0].id, 'Next track page advances without repeating entries');
    check((await request(`/${other.id}/tracks?limit=1`)).status === 404, 'Track pages protect other accounts');
    const catalog = await request('/catalog?view=songs&limit=1');
    check(catalog.status === 200 && catalog.body.songs.length === 1 && catalog.body.nextCursor, 'Account song catalog is deduplicated and paginated');
    const searched = await request('/catalog?view=songs&q=Fixture%20song');
    check(searched.status === 200 && searched.body.songs.every((song: any) => song.title.includes('Fixture song')), 'Server-side Library search spans the catalog');
    check((await request('/catalog?view=artists&limit=1')).status === 200, 'Artist groups load separately');
    check((await request('?limit=101')).status === 400 && (await request('/catalog?cursor=bad')).status === 400, 'Invalid page requests are rejected');
    await request(`/${other.id}/tracks/batch`, 'POST', { tracks: [tracks[0]] }, bob.id);
    const removed = await request(`/${removing.id}`, 'DELETE', { songDisposition: 'remove' });
    check(removed.status === 200 && removed.body.library.tracks.length === 0, 'Delete with songs removes matching Library entries');
    check(await db.playlistTrack.count({ where: { playlistId: shared.id } }) === 1 && await db.playlistTrack.count({ where: { playlistId: other.id } }) === 1, 'Other playlists and other accounts retain their songs');
    check(await db.song.count({ where: { id: { in: catalogIDs } } }) === 2, 'Playlist deletion never deletes the shared audio catalog');
    check((await request(`/${liked}`, 'DELETE', { songDisposition: 'keep' })).status === 400, 'The built-in Library cannot be deleted as a playlist');
    check(sameTrack({ songId: 'modern', title: 'Same', youtubeId: 'abcdefghijk' }, { title: 'Legacy title', youtubeId: 'abcdefghijk' }), 'Legacy and catalog tracks with the same video match');
    check(!sameTrack({ title: 'Same', artist: 'Same', youtubeId: 'abcdefghijk' }, { title: 'Same', artist: 'Same', youtubeId: 'lmnopqrstuv' }), 'Different video recordings remain distinct');
    const legacy = await db.playlist.create({ data: { userId: alice.id, name: 'Legacy client' } });
    check((await request(`/${legacy.id}`, 'DELETE')).status === 200, 'Legacy deletion without a choice remains compatible');
    console.log(`${checks} playlist API/database checks passed`);
  } finally {
    clients.forEach(socket => socket.disconnect());
    await new Promise<void>(resolve => io.close(() => resolve()));
    await db.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
    await db.song.deleteMany({ where: { title: { contains: suffix } } });
    await db.$disconnect();
    const { default: serviceDB } = await import('../db/prisma'); await serviceDB.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
