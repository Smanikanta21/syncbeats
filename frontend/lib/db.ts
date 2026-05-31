// lib/db.ts
// Handles local browser storage of audio track Blobs to bypass S3 and avoid server storage.

class TrackDB {
  private dbName = "syncbeats_cache";
  private storeName = "tracks";
  private db: IDBDatabase | null = null;

  async init(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      if (typeof window === "undefined" || !window.indexedDB) {
        reject(new Error("IndexedDB is not supported on this environment"));
        return;
      }

      const request = indexedDB.open(this.dbName, 1);
      
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async getTrack(id: string): Promise<Blob | null> {
    try {
      const db = await this.init();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readonly");
        const store = transaction.objectStore(this.storeName);
        const request = store.get(id);

        request.onsuccess = () => {
          resolve(request.result?.file || null);
        };

        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.warn("[TrackDB] Failed to get track from IndexedDB:", e);
      return null;
    }
  }

  async saveTrack(id: string, file: Blob, title: string): Promise<void> {
    try {
      const db = await this.init();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.put({ id, file, title, savedAt: Date.now() });

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error("[TrackDB] Failed to save track to IndexedDB:", e);
    }
  }

  async deleteTrack(id: string): Promise<void> {
    try {
      const db = await this.init();
      return new Promise<void>((resolve, reject) => {
        const transaction = db.transaction(this.storeName, "readwrite");
        const store = transaction.objectStore(this.storeName);
        const request = store.delete(id);

        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
      });
    } catch (e) {
      console.error("[TrackDB] Failed to delete track from IndexedDB:", e);
    }
  }
}

export const trackDB = new TrackDB();
