// core/RoomQueue.test.ts — run with: npx ts-node src/core/RoomQueue.test.ts
//
// Covers the five behaviours that made the old queue buggy. If one of these
// asserts fires, the queue can duplicate, skip, or lose tracks.

import assert from 'assert';
import { RoomQueue, trackKey } from './RoomQueue';

const t = (url: string, title = url) => ({ trackUrl: url, title });

// ── trackKey: same audio, different spelling → one key ────────────────────
assert.strictEqual(trackKey('youtube:dQw4w9WgXcQ'), 'yt:dQw4w9WgXcQ');
assert.strictEqual(trackKey('youtube:dQw4w9WgXcQ?thumb=a&pid=p1'), 'yt:dQw4w9WgXcQ');
assert.strictEqual(trackKey('https://youtube.com/watch?v=dQw4w9WgXcQ'), 'yt:dQw4w9WgXcQ');
assert.strictEqual(trackKey('youtube_dQw4w9WgXcQ.yt'), 'yt:dQw4w9WgXcQ');
// magnets carry their own ?/&, so they key on the hash, not a query strip
assert.strictEqual(
  trackKey('magnet:?xt=urn:btih:ABC123&dn=song'),
  trackKey('magnet:?xt=urn:btih:abc123&tr=udp://x'),
);
assert.notStrictEqual(trackKey('spotify-lazy:x1'), trackKey('spotify-lazy:x2'));

// ── 1. Re-adding a playlist doesn't double the queue ──────────────────────
{
  const q = new RoomQueue();
  const list = [t('youtube:aaaaaaaaaaa'), t('youtube:bbbbbbbbbbb'), t('youtube:ccccccccccc')];
  q.add(list, 'u1');
  const again = q.add(list.map(x => ({ ...x, trackUrl: `${x.trackUrl}?pid=p9` })), 'u1');

  assert.strictEqual(q.size, 3, 'replaying a queued playlist must not append a second copy');
  assert.strictEqual(again.added.length, 0);
  assert.strictEqual(again.skipped, 3);
  assert.strictEqual(again.first!.id, q.snapshot()[0].id, 'first must point at the existing item to jump to');
}

// ── 2. Exactly one current item, and jumpTo moves it ──────────────────────
{
  const q = new RoomQueue();
  q.add([t('youtube:aaaaaaaaaaa'), t('youtube:bbbbbbbbbbb'), t('youtube:ccccccccccc')], 'u1');
  const third = q.snapshot()[2];
  q.setCurrent(third.id);

  const flagged = q.snapshot().filter(i => i.isCurrent);
  assert.strictEqual(flagged.length, 1);
  assert.strictEqual(flagged[0].id, third.id);
  assert.deepStrictEqual(q.snapshot().map(i => i.queueIndex), [0, 1, 2], 'indexes are derived, never gapped');
}

// ── 3. Multi-device `ended` advances once, not once per device ────────────
{
  const q = new RoomQueue();
  q.add([t('youtube:aaaaaaaaaaa'), t('youtube:bbbbbbbbbbb')], 'u1');
  const first = q.current()!;

  assert.ok(q.shouldAdvance(first.trackUrl), 'the device that got here first advances');
  q.next();
  assert.ok(!q.shouldAdvance(first.trackUrl), 'a second device reporting the same track is ignored');
  assert.ok(!q.shouldAdvance(q.current()!.trackUrl), 'and the debounce window blocks an instant re-advance');
}

// ── 4. Shuffle is non-destructive (Apple Music semantics) ─────────────────
{
  const q = new RoomQueue();
  q.add(Array.from({ length: 12 }, (_, i) => t(`url-${i}`)), 'u1');
  const original = q.snapshot().map(i => i.trackUrl);

  q.setShuffle(true);
  assert.strictEqual(q.size, 12, 'shuffle must not add or drop items');
  assert.deepStrictEqual([...q.snapshot().map(i => i.trackUrl)].sort(), [...original].sort());

  q.setShuffle(false);
  assert.deepStrictEqual(q.snapshot().map(i => i.trackUrl), original, 'un-shuffle restores the original order');
}

// ── 5. Removing the current track promotes its successor ──────────────────
{
  const q = new RoomQueue();
  q.add([t('youtube:aaaaaaaaaaa'), t('youtube:bbbbbbbbbbb'), t('youtube:ccccccccccc')], 'u1');
  const [a, b] = q.snapshot();

  q.remove(a.id);
  assert.strictEqual(q.current()!.id, b.id, 'the next track takes over, not null');
  assert.strictEqual(q.size, 2);

  q.clear();
  assert.strictEqual(q.current(), null);
}

// ── 6. A duplicate stored by an older build dies on reload ────────────────
{
  const q = new RoomQueue();
  q.add([t('youtube:aaaaaaaaaaa')], 'u1');
  const raw: any = q.toJSON();
  raw.items.push({ ...raw.items[0], id: 'dupe' });   // simulate a corrupt blob
  raw.order.push('dupe');

  const reloaded = RoomQueue.fromJSON(raw);
  assert.strictEqual(reloaded.size, 1, 'fromJSON rebuilds by key, so stored duplicates are dropped');
}

// ── 7. Resolving a lazy track onto an already-queued one doesn't duplicate ─
{
  const q = new RoomQueue();
  q.add([t('youtube:aaaaaaaaaaa'), t('spotify-lazy:s1')], 'u1');
  const lazy = q.snapshot()[1];

  const survivor = q.resolve(lazy.id, 'youtube:aaaaaaaaaaa');
  assert.strictEqual(q.size, 1, 'the lazy item collapses into the track already present');
  assert.strictEqual(survivor!.trackUrl, 'youtube:aaaaaaaaaaa');
}

console.log('RoomQueue: all checks passed');
