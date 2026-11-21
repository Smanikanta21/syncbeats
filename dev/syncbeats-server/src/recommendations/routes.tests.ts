import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { Feed, Taste } from './engine';
import { ARTISTS, GENRES, LANGUAGES, ArtistSeed } from './catalog';

async function main() {
  const databaseURL = process.env.TEST_DATABASE_URL;
  if (!databaseURL) throw new Error('TEST_DATABASE_URL must point to an isolated local recommendations_test database.');
  const url = new URL(databaseURL);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/syncbeats_recommendations_test') throw new Error('Refusing to run API tests outside the isolated local test database.');
  process.env.DATABASE_URL = databaseURL;
  process.env.JWT_SECRET = randomUUID();
  const { createRecommendationRoutes } = await import('../handlers/RecommendationRoutes');
  const { createHistoryRoutes } = await import('../handlers/HistoryRoutes');
  const { createSearchRoutes } = await import('../handlers/SearchRoutes');
  const db = new PrismaClient();
  const suffix = randomUUID();
  const alice = await db.user.create({ data: { name: 'Alice', email: `alice-${suffix}@example.test` } });
  const bob = await db.user.create({ data: { name: 'Bob', email: `bob-${suffix}@example.test` } });
  const token = (user: typeof alice) => jwt.sign({ sub: user.id, email: user.email, name: user.name }, process.env.JWT_SECRET!, { expiresIn: '1h' });
  const app = express(); app.use(express.json());
  app.use('/recommendations', createRecommendationRoutes(db)); app.use('/history', createHistoryRoutes(db));
  app.use('/search', createSearchRoutes());
  const unavailableDB = { musicTasteProfile: { findUnique: async () => {
    throw Object.assign(new Error('private-sql-fixture'), { code: 'P2021' });
  } } } as unknown as PrismaClient;
  app.use('/unavailable-recommendations', createRecommendationRoutes(unavailableDB));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const base = `http://127.0.0.1:${address.port}`;
  async function request(path: string, method = 'GET', body?: unknown, user = alice, authenticated = true) {
    const response = await fetch(`${base}${path}`, { method, headers: { 'Content-Type': 'application/json', ...(authenticated ? { Authorization: `Bearer ${token(user)}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const parsed = await response.json() as { profile: Taste; sections: Feed['sections']; artists: ArtistSeed[]; onboardingStatus: string; languages: string[]; entry: { userId: string }; listens: unknown[]; error?: string; code?: string };
    return { status: response.status, body: parsed, cache: response.headers.get('cache-control') };
  }
  const interests = { onboardingStatus: 'COMPLETE', languages: ['Telugu'], genres: [], favoriteArtistIds: ['anirudh'], customArtists: [], useActivity: false };
  try {
    const logged: string[] = [];
    const originalError = console.error;
    try {
      console.error = (...args: unknown[]) => { logged.push(args.join(' ')); };
      const missingSchema = await request('/unavailable-recommendations/feed');
      assert.equal(missingSchema.status, 503);
      assert.equal(missingSchema.body.code, 'RECOMMENDATIONS_SCHEMA_NOT_READY');
      assert.ok(logged[0].includes('P2021') && logged[0].includes('prisma migrate deploy'));
      assert.ok(!JSON.stringify(missingSchema.body).includes('private-sql-fixture') && !logged.join('').includes('private-sql-fixture'));
    } finally { console.error = originalError; }
    assert.equal((await request('/recommendations/feed', 'GET', undefined, alice, false)).status, 401);
    assert.equal((await request('/history/recent', 'GET', undefined, alice, false)).status, 401);
    assert.equal((await request('/search/recommendations', 'GET', undefined, alice, false)).status, 401);
    const fresh = await request('/recommendations/feed');
    assert.equal(fresh.body.profile.onboardingStatus, 'NEW');
    assert.equal(fresh.body.sections[0].title, 'Starter picks');
    assert.equal(fresh.cache, 'private, no-store');
    assert.equal((await request('/recommendations/catalog')).body.artists.length, ARTISTS.length);
    const broadTaste = { ...interests, languages: [...LANGUAGES], genres: [...GENRES], favoriteArtistIds: ARTISTS.map(a => a.id), customArtists: ['Artist one', 'Artist two', 'Artist three', 'Artist four'] };
    assert.equal((await request('/recommendations/profile', 'PUT', broadTaste)).status, 200);
    const broadProfile = (await request('/recommendations/feed')).body.profile;
    assert.equal(broadProfile.favoriteArtistIds.length, ARTISTS.length);
    assert.equal(broadProfile.languages.length, LANGUAGES.length);
    assert.equal(broadProfile.customArtists.length, 4);
    assert.equal((await request('/recommendations/profile', 'PUT', { ...interests, userId: bob.id })).status, 200);
    assert.equal((await request('/recommendations/profile', 'GET', undefined, bob)).body.onboardingStatus, 'NEW');
    assert.deepEqual((await request(`/recommendations/feed?userId=${bob.id}`)).body.profile.languages, ['Telugu']);
    const reopened = await request('/recommendations/feed');
    assert.ok(reopened.body.sections[0].picks.some((p: { id: string }) => p.id === 'anirudh'));
    assert.equal((await request('/recommendations/profile', 'PUT', { ...interests, favoriteArtistIds: ['invalid-provider-id'] })).status, 400);
    const feedback = { artistId: 'anirudh', kind: 'DISLIKE', eventId: randomUUID(), userId: bob.id };
    assert.equal((await request('/recommendations/events', 'POST', feedback)).status, 200);
    assert.equal((await request('/recommendations/events', 'POST', feedback)).status, 200);
    assert.equal(await db.recommendationEvent.count({ where: { userId: alice.id } }), 1);
    assert.equal(await db.recommendationEvent.count({ where: { userId: bob.id } }), 0);
    assert.ok(!(await request('/recommendations/feed')).body.sections.flatMap((s: { picks: { id: string }[] }) => s.picks).some((p: { id: string }) => p.id === 'anirudh'));
    assert.equal((await request('/recommendations/events', 'POST', { ...feedback, eventId: randomUUID(), context: 'ROOM' })).status, 400);
    assert.equal((await request('/recommendations/events', 'POST', { artistId: 'dua-lipa', kind: 'OPEN', eventId: randomUUID() })).status, 200);
    assert.equal(await db.recommendationEvent.count({ where: { userId: alice.id } }), 1); // activity is opt-in
    const withoutFavorite = { ...interests, favoriteArtistIds: [] };
    assert.equal((await request('/recommendations/profile', 'PUT', { ...withoutFavorite, useActivity: true })).status, 200);
    await request('/recommendations/events', 'POST', { artistId: 'dua-lipa', kind: 'OPEN', eventId: randomUUID() });
    assert.equal(await db.recommendationEvent.count({ where: { userId: alice.id } }), 2);
    // Heavy activity cannot push an older explicit dislike out of the feed query.
    await db.recommendationEvent.createMany({ data: Array.from({ length: 1005 }, (_, i) => ({ userId: alice.id, artistId: 'dua-lipa', kind: 'OPEN', eventId: `bulk-${suffix}-${i}` })) });
    assert.ok(!(await request('/recommendations/feed')).body.sections.flatMap((s: { picks: { id: string }[] }) => s.picks).some((p: { id: string }) => p.id === 'anirudh'));
    await request('/recommendations/profile', 'PUT', withoutFavorite);
    assert.equal(await db.recommendationEvent.count({ where: { userId: alice.id } }), 1); // only explicit feedback survives opting out
    await request('/recommendations/profile', 'PUT', interests);
    assert.ok((await request('/recommendations/feed')).body.sections[0].picks.some(p => p.id === 'anirudh')); // choosing again restores a dismissed artist
    const listen = await request('/history/listen', 'POST', { userId: bob.id, youtubeId: 'test-video', title: 'A room track', artist: 'Anirudh Ravichander' });
    assert.equal(listen.status, 200); assert.equal(listen.body.entry.userId, alice.id);
    assert.equal((await request(`/history/recent?userId=${alice.id}`, 'GET', undefined, bob)).body.listens.length, 0);
    assert.equal((await request('/recommendations/profile', 'DELETE')).status, 200);
    assert.equal(await db.recommendationEvent.count({ where: { userId: alice.id } }), 0);
    assert.equal((await request('/recommendations/profile')).body.onboardingStatus, 'NEW');
    console.log('Recommendation API checks passed against local PostgreSQL: authentication, identity isolation, persistence, idempotency, opt-in, durable feedback, reset and history ownership.');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.user.deleteMany({ where: { id: { in: [alice.id, bob.id] } } });
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
