import { trackCacheKey } from './trackIdentity';
import { ytId } from './youtube';

let dbInstance: IDBDatabase | null = null;

export interface TrackMeta {
  size: number;
  lastAccessed: number;
  title?: string;
}

export const initDB = (): Promise<IDBDatabase> => {
  if (dbInstance) return Promise.resolve(dbInstance);

  // Request persistent storage on iOS / modern browsers
  if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.persist) {
    navigator.storage.persist().then((granted) => {
      console.log("[IDB] Storage persistent granted:", granted);
    }).catch(() => {});
  }

  return new Promise((resolve, reject) => {
    const req = indexedDB.open("SyncBeatsDB", 2);

    req.onupgradeneeded = (e: any) => {
      const db: IDBDatabase = e.target.result;
      if (!db.objectStoreNames.contains("tracks")) {
        db.createObjectStore("tracks");
      }
      if (!db.objectStoreNames.contains("trackMeta")) {
        db.createObjectStore("trackMeta");
      }
    };

    req.onsuccess = () => {
      dbInstance = req.result;
      dbInstance.onversionchange = () => { dbInstance?.close(); dbInstance = null; };
      resolve(req.result);
    };

    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Audio cache is unavailable'));
  });
};

export const evictLRU = async (targetFreeBytes: number = 200 * 1024 * 1024): Promise<void> => {
  try {
    if (typeof navigator === "undefined" || !navigator.storage || !navigator.storage.estimate) return;

    const estimate = await navigator.storage.estimate();
    const quota = estimate.quota || 0;
    const usage = estimate.usage || 0;
    let available = quota - usage;

    if (available >= targetFreeBytes) return;

    console.log(`[IDB] Low storage space (${Math.round(available / (1024 * 1024))}MB free). Evicting LRU tracks...`);

    const db = await initDB();
    const metaTx = db.transaction("trackMeta", "readonly");
    const metaStore = metaTx.objectStore("trackMeta");

    const entries: { key: string; meta: TrackMeta }[] = await new Promise((resolve) => {
      const items: { key: string; meta: TrackMeta }[] = [];
      const cursorReq = metaStore.openCursor();
      cursorReq.onsuccess = (e: any) => {
        const cursor = e.target.result;
        if (cursor) {
          items.push({ key: cursor.key as string, meta: cursor.value as TrackMeta });
          cursor.continue();
        } else {
          resolve(items);
        }
      };
      cursorReq.onerror = () => resolve([]);
    });

    // Sort by lastAccessed ascending (oldest first)
    entries.sort((a, b) => (a.meta.lastAccessed || 0) - (b.meta.lastAccessed || 0));

    for (const item of entries) {
      if (available >= targetFreeBytes) break;
      console.log(`[IDB] Evicting track: ${item.key} (${Math.round((item.meta.size || 0) / (1024 * 1024))}MB)`);
      await removeTrack(item.key);
      available += (item.meta.size || 0);
    }
  } catch (err) {
    console.warn("[IDB] LRU eviction warning:", err);
  }
};

function cacheAliases(key: string): string[] {
  const id = ytId(key);
  return [...new Set([trackCacheKey(key), key, ...(id ? ['youtube:' + id, 'ws-p2p:yt:' + id] : [])])];
}

export const cacheYouTubeTrack = async (key: string, blob: Blob, title?: string): Promise<boolean> => {
  try {
    if (!key || !blob.size) return false;
    if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
      const { quota = 0, usage = 0 } = await navigator.storage.estimate();
      if (quota > 0 && quota - usage < 50 * 1024 * 1024) await evictLRU(200 * 1024 * 1024);
    }
    const db = await initDB();
    const canonical = trackCacheKey(key);
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['tracks', 'trackMeta'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error ?? new Error('Audio cache write failed'));
      tx.objectStore('tracks').put(blob, canonical);
      tx.objectStore('trackMeta').put({ size: blob.size, lastAccessed: Date.now(), title } satisfies TrackMeta, canonical);
    });
    return true;
  } catch (error) {
    console.warn('[IDB] Audio cache unavailable:', error);
    return false;
  }
};

export const getCachedYouTubeTrack = async (key: string): Promise<Blob | null> => {
  try {
    if (!key) return null;
    const db = await initDB();
    for (const candidate of cacheAliases(key)) {
      const blob = await new Promise<Blob | null>((resolve, reject) => {
        const request = db.transaction('tracks', 'readonly').objectStore('tracks').get(candidate);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
      if (!blob) continue;
      // Older transport-specific entries remain readable without re-downloading.
      const tx = db.transaction('trackMeta', 'readwrite');
      tx.objectStore('trackMeta').put({ size: blob.size, lastAccessed: Date.now() } satisfies TrackMeta, candidate);
      return blob;
    }
    return null;
  } catch (error) {
    console.warn('[IDB] Audio cache read unavailable:', error);
    return null;
  }
};

export const saveTrack = cacheYouTubeTrack;
export const getTrack = getCachedYouTubeTrack;

export const removeTrack = async (key: string): Promise<void> => {
  try {
    const db = await initDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(['tracks', 'trackMeta'], 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = tx.onabort = () => reject(tx.error);
      for (const candidate of cacheAliases(key)) {
        tx.objectStore('tracks').delete(candidate);
        tx.objectStore('trackMeta').delete(candidate);
      }
    });
  } catch (error) {
    console.warn('[IDB] Could not remove cached audio:', error);
  }
};
