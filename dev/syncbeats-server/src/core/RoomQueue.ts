// core/RoomQueue.ts — single source of truth for a room's play queue.
//
// The previous queue kept three copies of the truth (Postgres rows with their own
// `queue_index`/`is_current`, an in-memory mirror, and the client's optimistic list)
// and matched tracks with fuzzy URL comparison. They drifted, which is what produced
// duplicate entries. This module holds the whole queue in one place with four invariants:
//
//   1. `items` (user order) and `order` (playback order) always hold the same ids.
//   2. Exactly one `currentId` — never a per-item `isCurrent` flag that can be 0 or 2.
//   3. One item per normalized `key` — dedup is a Map lookup, not fuzzy matching.
//   4. Items are immutable once added; metadata is resolved before insertion.

import { randomUUID } from 'crypto';
import { QueueItem, QueueTrackInput, RepeatMode, TrackQueueItem } from '../types';
import { YT_ID_PATTERN, ytId } from '../utils/youtube';

/**
 * Stable identity for a track within a room. Two inputs that name the same audio
 * must produce the same key, or the queue will happily hold both.
 *
 * The enqueue routes append volatile metadata to trackUrl (`?thumb=…&pid=…`) which the
 * client still reads, so the query string is stripped here rather than at the source.
 * magnet: URIs embed their own `?`/`&`, so they are keyed on the btih hash instead.
 */
export function trackKey(rawUrl: string): string {
  const url = (rawUrl || '').trim();
  if (!url) return '';

  if (url.startsWith('magnet:')) {
    const m = url.match(/xt=urn:btih:([^&]+)/i);
    return m ? `magnet:${m[1].toLowerCase()}` : `url:${url.toLowerCase()}`;
  }

  const base = url.split('?')[0];

  const yt = ytId(url);
  if (yt) return `yt:${yt}`;

  const sp = base.match(/^spotify-lazy:(.+)$/);
  if (sp) return `sp:${sp[1]}`;

  return `url:${base.toLowerCase()}`;
}

function fileNameFromUrl(url: string): string {
  const base = url.split('?')[0];
  const yt = base.match(new RegExp(`(${YT_ID_PATTERN})$`));
  if (base.startsWith('youtube:') && yt) return `youtube_${yt[1]}.yt`;
  return base.split('/').pop() || 'track.mp3';
}

export interface AddResult {
  added: QueueItem[];
  /** Inputs rejected because the room already holds that track (or the url was empty). */
  skipped: number;
  /** Queue item for the first input — newly added OR the existing duplicate. */
  first: QueueItem | null;
}

export class RoomQueue {
  private items: QueueItem[] = [];
  private order: string[] = [];
  private byKey = new Map<string, string>();
  private currentId: string | null = null;
  private lastAdvanceAt = 0;
  private nextOrder: string[] | null = null;

  shuffle = false;
  repeatMode: RepeatMode = 'off';
  /** Bumped on every mutation so clients can discard stale broadcasts. */
  version = 0;

  // ── Reads ───────────────────────────────────────────────────────────────

  get size(): number { return this.items.length; }

  current(): QueueItem | null {
    return this.currentId ? this.byId(this.currentId) : null;
  }

  find(id: string): QueueItem | null { return this.byId(id); }

  findByUrl(trackUrl: string): QueueItem | null {
    const id = this.byKey.get(trackKey(trackUrl));
    return id ? this.byId(id) : null;
  }

  /** Stable look-ahead, including the shuffle order of the next repeat-all lap. */
  peekNext(ignoreRepeatTrack = false): QueueItem | null {
    if (this.order.length === 0) return null;
    if (!ignoreRepeatTrack && this.repeatMode === 'track') return this.current();
    const index = this.currentId ? this.order.indexOf(this.currentId) : -1;
    if (index + 1 < this.order.length) return this.byId(this.order[index + 1]);
    if (this.repeatMode !== 'all') return null;
    return this.byId(this.getNextOrder()[0]);
  }

  /** Wire shape the web client consumes, serialized in playback order. */
  snapshot(): TrackQueueItem[] {
    return this.order.map((id, queueIndex) => ({
      ...this.byId(id)!,
      queueIndex,
      isCurrent: id === this.currentId,
    }));
  }

  // ── Mutations ───────────────────────────────────────────────────────────

  /**
   * Add tracks, skipping any already in the room. `mode: 'next'` inserts directly after
   * the current track (Apple Music's "Play Next"); `'end'` appends.
   */
  add(tracks: QueueTrackInput[], addedBy: string, mode: 'end' | 'next' = 'end'): AddResult {
    const added: QueueItem[] = [];
    let skipped = 0;
    let first: QueueItem | null = null;

    for (const t of tracks) {
      const url = (t.trackUrl || '').trim();
      if (!url) { skipped++; continue; }

      const key = trackKey(url);
      const existingId = this.byKey.get(key);
      if (existingId) {
        skipped++;
        if (!first) first = this.byId(existingId);
        continue;
      }

      const item: QueueItem = {
        id: randomUUID(),
        key,
        trackUrl: url,
        title: (t.title || '').trim() || 'Unknown Track',
        artist: (t.artist || '').trim(),
        thumbnail: t.thumbnail || undefined,
        fileName: t.fileName || fileNameFromUrl(url),
        addedBy,
        createdAt: Date.now(),
        durationSec: t.durationSec,
      };
      this.byKey.set(key, item.id);
      added.push(item);
      if (!first) first = item;
    }

    if (added.length > 0) {
      const ids = added.map(i => i.id);
      const anchor = mode === 'next' && this.currentId ? this.order.indexOf(this.currentId) : -1;
      if (anchor >= 0) {
        this.items.splice(this.itemIndex(this.currentId!) + 1, 0, ...added);
        this.order.splice(anchor + 1, 0, ...ids);
      } else {
        this.items.push(...added);
        this.order.push(...ids);
      }
      if (!this.currentId) this.currentId = ids[0];
      this.bump();
    }

    return { added, skipped, first };
  }

  remove(id: string): QueueItem | null {
    const idx = this.itemIndex(id);
    if (idx === -1) return null;

    const [item] = this.items.splice(idx, 1);
    const orderIdx = this.order.indexOf(id);
    if (orderIdx !== -1) this.order.splice(orderIdx, 1);
    this.byKey.delete(item.key);

    if (this.currentId === id) {
      // Whatever slid into this slot becomes current; fall back to the one before it.
      this.currentId = this.order[orderIdx] ?? this.order[orderIdx - 1] ?? null;
    }
    this.bump();
    return item;
  }

  /** Drop everything after the current track, keeping history and what's playing. */
  clearUpcoming(): void {
    if (!this.currentId) { this.clear(); return; }
    const cut = this.order.indexOf(this.currentId);
    const keep = new Set(this.order.slice(0, cut + 1));
    this.items = this.items.filter(i => keep.has(i.id));
    this.order = this.order.filter(id => keep.has(id));
    this.byKey = new Map(this.items.map(i => [i.key, i.id]));
    this.bump();
  }

  clear(): void {
    this.items = [];
    this.order = [];
    this.byKey.clear();
    this.currentId = null;
    this.bump();
  }

  /** `toIndex` is an index into the displayed (playback) order, which is what the client sends. */
  move(id: string, toIndex: number): boolean {
    const from = this.order.indexOf(id);
    if (from === -1) return false;
    const to = Math.max(0, Math.min(Math.trunc(toIndex), this.order.length - 1));
    if (from === to) return false;

    this.order.splice(to, 0, ...this.order.splice(from, 1));
    // With shuffle off the displayed order IS the canonical order, so keep them in step.
    if (!this.shuffle) this.items = this.order.map(i => this.byId(i)!);
    this.bump();
    return true;
  }

  setCurrent(id: string): QueueItem | null {
    const item = this.byId(id);
    if (!item) return null;
    this.markCurrentPlayed();
    this.currentId = id;
    this.lastAdvanceAt = Date.now();
    this.bump();
    return item;
  }

  /**
   * The track you are leaving goes to history — you heard it. Tracks the pointer *skips
   * over* are never touched, which is the whole point: jumping from 36 to 43 must move
   * only 36 to history and leave 37–42 sitting in the queue.
   */
  private markCurrentPlayed(): void {
    const cur = this.current();
    if (!cur || cur.playedAt) return;
    cur.playedAt = Date.now();
  }

  next(ignoreRepeatTrack = false): QueueItem | null {
    if (this.order.length === 0) return null;
    if (!ignoreRepeatTrack && this.repeatMode === 'track' && this.currentId) {
      this.lastAdvanceAt = Date.now();
      this.bump();
      return this.current();
    }

    const idx = this.currentId ? this.order.indexOf(this.currentId) : -1;
    let nextIdx = idx + 1;

    this.markCurrentPlayed();

    if (nextIdx >= this.order.length) {
      if (this.repeatMode !== 'all') return null;
      this.order = this.getNextOrder().slice();
      // New lap — clear history so the whole queue isn't stuck in the History section.
      for (const it of this.items) delete it.playedAt;
      nextIdx = 0;
    }

    this.currentId = this.order[nextIdx];
    this.lastAdvanceAt = Date.now();
    this.bump();
    return this.current();
  }

  prev(): QueueItem | null {
    if (this.order.length === 0) return null;
    const idx = this.currentId ? this.order.indexOf(this.currentId) : 0;

    if (idx - 1 < 0) {
      if (this.repeatMode !== 'all') return this.current(); // restart, don't fall off the front
      this.currentId = this.order[this.order.length - 1];
    } else {
      this.currentId = this.order[idx - 1];
    }
    this.lastAdvanceAt = Date.now();
    this.bump();
    return this.current();
  }

  /**
   * Whether a `playback:ended` for this url should advance the room. Every connected device
   * fires the event, so without these two guards an N-device room would skip N tracks at once.
   */
  shouldAdvance(trackUrl: string): boolean {
    const cur = this.current();
    if (!cur) return false;
    if (trackKey(trackUrl) !== cur.key) return false;          // stale device, already advanced
    if (Date.now() - this.lastAdvanceAt < 1500) return false;  // another device won the race
    return true;
  }

  setShuffle(on: boolean): void {
    if (this.shuffle === on) return;
    this.shuffle = on;
    if (on) {
      this.reshuffleUpcoming(this.currentId ? this.order.indexOf(this.currentId) : -1);
    } else {
      this.order = this.items.map(i => i.id); // non-destructive: canonical order was never lost
    }
    this.bump();
  }

  setRepeat(mode: RepeatMode): void {
    if (this.repeatMode === mode) return;
    this.repeatMode = mode;
    this.bump();
  }

  /**
   * Swap a placeholder url for its resolved one (spotify-lazy: → youtube:). If the resolved
   * track is already queued, the duplicate is dropped and the existing item survives.
   */
  resolve(id: string, newTrackUrl: string): QueueItem | null {
    const item = this.byId(id);
    if (!item) return null;

    const key = trackKey(newTrackUrl);
    if (key === item.key) {
      item.trackUrl = newTrackUrl;
      this.bump();
      return item;
    }

    const clashId = this.byKey.get(key);
    if (clashId && clashId !== id) {
      const survivor = this.byId(clashId);
      const wasCurrent = this.currentId === id;
      this.remove(id);
      if (wasCurrent) this.currentId = clashId;
      return survivor;
    }

    this.byKey.delete(item.key);
    item.key = key;
    item.trackUrl = newTrackUrl;
    this.byKey.set(key, item.id);
    this.bump();
    return item;
  }

  // ── Persistence ─────────────────────────────────────────────────────────

  toJSON() {
    return {
      v: 1 as const,
      items: this.items,
      order: this.order,
      currentId: this.currentId,
      shuffle: this.shuffle,
      repeatMode: this.repeatMode,
      nextOrder: this.nextOrder,
    };
  }

  static fromJSON(raw: unknown): RoomQueue {
    const q = new RoomQueue();
    const data = raw as ReturnType<RoomQueue['toJSON']> | null;
    if (!data || !Array.isArray(data.items)) return q;

    // Rebuild rather than trust the blob — a stored duplicate must not survive a reload.
    for (const it of data.items) {
      if (!it?.trackUrl) continue;
      const key = it.key || trackKey(it.trackUrl);
      if (q.byKey.has(key)) continue;
      const item: QueueItem = { ...it, key, id: it.id || randomUUID() };
      q.items.push(item);
      q.byKey.set(key, item.id);
    }

    const known = new Set(q.items.map(i => i.id));
    const stored = Array.isArray(data.order) ? data.order.filter(id => known.has(id)) : [];
    const missing = q.items.map(i => i.id).filter(id => !stored.includes(id));
    q.order = [...stored, ...missing];

    q.currentId = data.currentId && known.has(data.currentId) ? data.currentId : null;
    q.shuffle = !!data.shuffle;
    q.repeatMode = (['off', 'all', 'track'] as const).includes(data.repeatMode as RepeatMode)
      ? (data.repeatMode as RepeatMode)
      : 'off';
    if (Array.isArray(data.nextOrder) && data.nextOrder.length === known.size &&
        new Set(data.nextOrder).size === known.size && data.nextOrder.every(id => known.has(id))) {
      q.nextOrder = data.nextOrder.slice();
    }

    // Queues written before `playedAt` existed encoded history as position: everything
    // ahead of the pointer had been played. Backfill once so a room that reloads after
    // the upgrade doesn't come back with an empty History section.
    if (q.currentId && q.items.every(i => !i.playedAt)) {
      const cut = q.order.indexOf(q.currentId);
      for (const id of q.order.slice(0, cut)) {
        const item = q.byId(id);
        if (item) item.playedAt = item.createdAt || Date.now();
      }
    }
    return q;
  }

  // ── Private ─────────────────────────────────────────────────────────────

  private byId(id: string): QueueItem | null {
    return this.items.find(i => i.id === id) ?? null;
  }

  private itemIndex(id: string): number {
    return this.items.findIndex(i => i.id === id);
  }

  /** Fisher-Yates over everything after `afterIdx`; played history keeps its order. */
  private reshuffleUpcoming(afterIdx: number): void {
    const head = this.order.slice(0, afterIdx + 1);
    const tail = this.order.slice(afterIdx + 1);
    for (let i = tail.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [tail[i], tail[j]] = [tail[j], tail[i]];
    }
    this.order = [...head, ...tail];
  }

  private getNextOrder(): string[] {
    if (this.nextOrder) return this.nextOrder;
    const order = this.order.slice();
    if (this.shuffle) {
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }
      // Avoid playing the last item twice at the lap boundary when possible.
      if (order.length > 1 && order[0] === this.currentId) {
        [order[0], order[1]] = [order[1], order[0]];
      }
    }
    this.nextOrder = order;
    return order;
  }

  private bump(): void { this.version++; this.nextOrder = null; }
}
