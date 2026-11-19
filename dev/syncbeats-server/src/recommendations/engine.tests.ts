import assert from 'node:assert/strict';
import { buildFeed, emptyTaste, parseTaste, Signal } from './engine';
import { ARTISTS, GENRES, LANGUAGES, MAX_CUSTOM_ARTISTS, artistsInText } from './catalog';

const now = new Date('2026-11-19T12:00:00Z');
const signal = (artistId: string, kind: string, context = 'PERSONAL', age = 0, secondsListened = 60): Signal => ({ artistId, kind, context, secondsListened, createdAt: new Date(now.getTime() - age * 86_400_000) });
const flatten = (feed: ReturnType<typeof buildFeed>) => feed.sections.flatMap(s => s.picks);
const score = (feed: ReturnType<typeof buildFeed>, id: string) => flatten(feed).find(p => p.id === id)?.score;

const starter = buildFeed(emptyTaste(), [], now);
assert.equal(starter.sections[0].title, 'Starter picks');
assert.ok(flatten(starter).length >= 8);
assert.deepEqual(starter, buildFeed(emptyTaste(), [], now));
assert.equal(new Set(flatten(starter).map(p => p.id)).size, flatten(starter).length);

const taste = parseTaste({ languages: ['Telugu'], favoriteArtistIds: ['anirudh', 'sid-sriram'], useActivity: true });
const personal = buildFeed(taste, [], now);
assert.equal(personal.sections[0].id, 'your-artists');
assert.ok(personal.sections[0].picks.some(p => p.id === 'anirudh'));
assert.ok(personal.sections[1].picks[0].languages.includes('Telugu'));
assert.ok(personal.sections[1].picks.every(p => !['anirudh', 'sid-sriram'].includes(p.id)));

assert.ok(!flatten(buildFeed(taste, [signal('anirudh', 'DISLIKE')], now)).some(p => p.id === 'anirudh'));
assert.ok(flatten(buildFeed(taste, [signal('anirudh', 'DISLIKE', 'PERSONAL', 1), signal('anirudh', 'LIKE')], now)).some(p => p.id === 'anirudh'));
assert.equal(score(buildFeed(emptyTaste(), [signal('dua-lipa', 'PLAY')], now), 'dua-lipa'), score(starter, 'dua-lipa'));
const enabled = { ...emptyTaste(), useActivity: true };
assert.equal(score(buildFeed(enabled, [signal('dua-lipa', 'PLAY', 'ROOM')], now), 'dua-lipa'), score(starter, 'dua-lipa'));
assert.equal(score(buildFeed(enabled, [signal('dua-lipa', 'PLAY', 'PERSONAL', 0, 5)], now), 'dua-lipa'), score(starter, 'dua-lipa'));
assert.ok((score(buildFeed(enabled, [signal('dua-lipa', 'PLAY')], now), 'dua-lipa') ?? 0) > (score(starter, 'dua-lipa') ?? 0));
assert.ok((score(buildFeed(enabled, [signal('dua-lipa', 'OPEN')], now), 'dua-lipa') ?? 0) > (score(buildFeed(enabled, [signal('dua-lipa', 'OPEN', 'PERSONAL', 60)], now), 'dua-lipa') ?? 0));
assert.ok((score(buildFeed(enabled, Array.from({ length: 100 }, () => signal('dua-lipa', 'OPEN')), now), 'dua-lipa') ?? 0) <= 12);
const custom = buildFeed(parseTaste({ customArtists: ['My local band'] }), [], now);
assert.equal(custom.sections[0].picks[0].query, 'My local band songs');
assert.equal(parseTaste({ customArtists: ['My Band', 'my band'] }).customArtists.length, 1);
assert.equal(buildFeed(parseTaste({ customArtists: ['Anirudh Ravichander'] }), [], now).sections[0].picks[0].id, 'anirudh');
assert.equal(buildFeed(parseTaste({ genres: ['Rock'] }), [], now).sections[0].title, 'Discover from your interests');
assert.throws(() => parseTaste({ favoriteArtistIds: ['provider-injected-id'] }));
assert.throws(() => parseTaste({ languages: ['Not supported'] }));
assert.throws(() => parseTaste({ useActivity: 'true' }));
assert.throws(() => parseTaste({ customArtists: ['bad\u0000name'] }));
assert.equal(parseTaste({ customArtists: ['one', 'two', 'three', 'four'] }).customArtists.length, 4);
assert.equal(parseTaste({ favoriteArtistIds: ARTISTS.map(a => a.id), languages: [...LANGUAGES], genres: [...GENRES] }).favoriteArtistIds.length, ARTISTS.length);
assert.throws(() => parseTaste({ customArtists: Array.from({ length: MAX_CUSTOM_ARTISTS + 1 }, (_, index) => `Artist ${index}`) }));
assert.deepEqual(artistsInText('listen to A R Rahman songs').map(a => a.id), ['ar-rahman']);
assert.deepEqual(artistsInText('notarijit singhxx'), []);
console.log('Recommendation ranking checks passed: cold start, interests, diversity, feedback, consent, room attribution, duration, decay, caps and validation.');
