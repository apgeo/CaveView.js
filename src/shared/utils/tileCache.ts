export interface TileCacheBackend {
  isAvailable(): boolean;
  get(key: string): Promise<Blob | null>;
  put(key: string, blob: Blob): Promise<void>;
  clear(): Promise<void>;
}

interface TileCacheEntry {
  key: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
  lastAccessed: number;
}

const DB_NAME = 'caveview-map-tile-cache';
const DB_VERSION = 1;
const STORE_NAME = 'tiles';
const KEY_VERSION = 'v2';

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

export function createXyzTileCacheKey(sourceKey: string, zoom: number, x: number, y: number): string {
  const safeSource = encodeURIComponent(sourceKey || 'unknown').slice(0, 180);
  return `caveview:xyz:${KEY_VERSION}:${safeSource}:${zoom}:${x}:${y}`;
}

export class IndexedDbTileCache implements TileCacheBackend {
  private dbPromise: Promise<IDBDatabase | null> | null = null;
  private disabled = false;

  constructor(
    private readonly maxEntries = 2500,
    private readonly maxEntryBytes = 2 * 1024 * 1024
  ) {}

  isAvailable(): boolean {
    return !this.disabled && typeof indexedDB !== 'undefined' && typeof Blob !== 'undefined';
  }

  private async openDb(): Promise<IDBDatabase | null> {
    if (!this.isAvailable()) return null;
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise((resolve) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        const store = db.objectStoreNames.contains(STORE_NAME)
          ? request.transaction!.objectStore(STORE_NAME)
          : db.createObjectStore(STORE_NAME, { keyPath: 'key' });

        if (!store.indexNames.contains('lastAccessed')) {
          store.createIndex('lastAccessed', 'lastAccessed', { unique: false });
        }
      };

      request.onerror = () => {
        this.disabled = true;
        resolve(null);
      };

      request.onblocked = () => {
        this.disabled = true;
        resolve(null);
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => db.close();
        resolve(db);
      };
    });

    return this.dbPromise;
  }

  async get(key: string): Promise<Blob | null> {
    const db = await this.openDb();
    if (!db) return null;

    try {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const done = waitForTransaction(tx);
      const store = tx.objectStore(STORE_NAME);
      const [entry] = await Promise.all([
        requestToPromise<TileCacheEntry | undefined>(store.get(key)),
        done.then(() => undefined),
      ]);
      return entry?.blob || null;
    } catch (error) {
      console.warn('Tile cache read failed', error);
      return null;
    }
  }

  async put(key: string, blob: Blob): Promise<void> {
    if (!this.isAvailable() || blob.size > this.maxEntryBytes) return;

    const db = await this.openDb();
    if (!db) return;

    try {
      const now = Date.now();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const done = waitForTransaction(tx);
      const store = tx.objectStore(STORE_NAME);
      store.put({
        key,
        blob,
        mimeType: blob.type || 'application/octet-stream',
        size: blob.size,
        createdAt: now,
        lastAccessed: now,
      } satisfies TileCacheEntry);
      await done;
      void this.pruneIfNeeded();
    } catch (error) {
      console.warn('Tile cache write failed', error);
    }
  }

  async clear(): Promise<void> {
    const db = await this.openDb();
    if (!db) return;

    try {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const done = waitForTransaction(tx);
      tx.objectStore(STORE_NAME).clear();
      await done;
    } catch (error) {
      console.warn('Tile cache clear failed', error);
    }
  }

  private async pruneIfNeeded(): Promise<void> {
    const db = await this.openDb();
    if (!db || this.maxEntries <= 0) return;

    try {
      const countTx = db.transaction(STORE_NAME, 'readonly');
      const countDone = waitForTransaction(countTx);
      const [count] = await Promise.all([
        requestToPromise<number>(countTx.objectStore(STORE_NAME).count()),
        countDone.then(() => undefined),
      ]);
      if (count <= this.maxEntries) return;

      const deleteCount = count - this.maxEntries;
      const pruneTx = db.transaction(STORE_NAME, 'readwrite');
      const pruneDone = waitForTransaction(pruneTx);
      const index = pruneTx.objectStore(STORE_NAME).index('lastAccessed');
      const cursorRequest = index.openCursor();
      let deleted = 0;

      const cursorDone = new Promise<void>((resolve, reject) => {
        cursorRequest.onerror = () => reject(cursorRequest.error || new Error('Tile cache prune failed'));
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor || deleted >= deleteCount) {
            resolve();
            return;
          }

          cursor.delete();
          deleted++;
          cursor.continue();
        };
      });

      await Promise.all([cursorDone, pruneDone]);
    } catch (error) {
      console.warn('Tile cache prune failed', error);
    }
  }
}

export const browserTileCache = new IndexedDbTileCache();

export async function clearBrowserTileCache(): Promise<void> {
  await browserTileCache.clear();
}
