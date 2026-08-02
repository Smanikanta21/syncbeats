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
      resolve(req.result);
    };

    req.onerror = () => reject(req.error);
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

export const cacheYouTubeTrack = async (key: string, blob: Blob, title?: string): Promise<void> => {
  try {
    if (!key || !blob || blob.size < 1000) return;

    // Quota check: if < 50MB free, trigger LRU eviction targeting 200MB free
    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      const quota = estimate.quota || 0;
      const usage = estimate.usage || 0;
      if (quota - usage < 50 * 1024 * 1024) {
        await evictLRU(200 * 1024 * 1024);
      }
    }

    const db = await initDB();
    
    // Write blob
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("tracks", "readwrite");
      const store = tx.objectStore("tracks");
      const req = store.put(blob, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    // Write metadata
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("trackMeta", "readwrite");
      const store = tx.objectStore("trackMeta");
      const meta: TrackMeta = {
        size: blob.size,
        lastAccessed: Date.now(),
        title,
      };
      const req = store.put(meta, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    console.log(`[IDB] Successfully cached track '${key}' (${Math.round(blob.size / 1024)} KB)`);
  } catch (err) {
    console.error("[IDB] Failed to cache track:", err);
  }
};

export const getCachedYouTubeTrack = async (key: string): Promise<Blob | null> => {
  try {
    if (!key) return null;
    const db = await initDB();

    const blob: Blob | null = await new Promise((resolve, reject) => {
      const tx = db.transaction("tracks", "readonly");
      const store = tx.objectStore("tracks");
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });

    if (blob) {
      // Asynchronously update lastAccessed timestamp
      (async () => {
        try {
          const tx = db.transaction("trackMeta", "readwrite");
          const store = tx.objectStore("trackMeta");
          const getReq = store.get(key);
          getReq.onsuccess = () => {
            const existing = getReq.result || {};
            store.put({ ...existing, lastAccessed: Date.now() }, key);
          };
        } catch (e) {}
      })();
    }

    return blob;
  } catch (err) {
    console.error("[IDB] Failed to get cached track:", err);
    return null;
  }
};

// Aliases & backwards-compatibility helpers for magnet and legacy calls
export const saveTrack = async (key: string, blob: Blob): Promise<void> => {
  return cacheYouTubeTrack(key, blob);
};

export const getTrack = async (key: string): Promise<Blob | null> => {
  return getCachedYouTubeTrack(key);
};

export const removeTrack = async (key: string): Promise<void> => {
  try {
    const db = await initDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("tracks", "readwrite");
      const store = tx.objectStore("tracks");
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction("trackMeta", "readwrite");
      const store = tx.objectStore("trackMeta");
      const req = store.delete(key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.error("[IDB] Failed to remove track:", err);
  }
};
