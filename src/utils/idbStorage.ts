import type { StateStorage } from 'zustand/middleware';

const DB_NAME = 'book-bitch-db';
const STORE_NAME = 'kv';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_NAME, mode);
    const req = fn(t.objectStore(STORE_NAME));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;
function getDB(): Promise<IDBDatabase> {
  if (!dbPromise) dbPromise = openDB();
  return dbPromise;
}

const WRITE_DEBOUNCE_MS = 250;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let pendingResolvers: Array<{ resolve: () => void; reject: (err: unknown) => void }> = [];

export const idbStorage: StateStorage = {
  async getItem(key: string): Promise<string | null> {
    const db = await getDB();
    const value = await tx(db, 'readonly', (s) => s.get(key)) as string | undefined;

    // One-time migration: pull existing data out of localStorage
    if (value === undefined) {
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        await idbStorage.setItem(key, legacy);
        try { localStorage.removeItem(key); } catch { /* ignore */ }
        return legacy;
      }
      return null;
    }
    return value ?? null;
  },

  // zustand's persist middleware re-serializes and writes the *entire* app
  // state on every single store mutation, with no coalescing of its own. A
  // bulk operation that fires dozens of mutations in a tight synchronous
  // loop (e.g. re-syncing a many-tab Google Doc, one addItem/updateItem per
  // tab) would otherwise kick off that many concurrent IndexedDB writes,
  // each holding its own full (and growing) serialized copy of the state
  // alive in memory until its own write resolves — nothing awaits the
  // previous one, so they all pile up at once. Debounce so only the last
  // (most complete) value in a burst actually gets written; every caller
  // still resolves once that write lands.
  async setItem(key: string, value: string): Promise<void> {
    return new Promise((resolve, reject) => {
      pendingResolvers.push({ resolve, reject });
      if (writeTimer) clearTimeout(writeTimer);
      writeTimer = setTimeout(() => {
        writeTimer = null;
        const resolvers = pendingResolvers;
        pendingResolvers = [];
        getDB()
          .then((db) => tx(db, 'readwrite', (s) => s.put(value, key)))
          .then(() => resolvers.forEach((r) => r.resolve()))
          .catch((err) => resolvers.forEach((r) => r.reject(err)));
      }, WRITE_DEBOUNCE_MS);
    });
  },

  async removeItem(key: string): Promise<void> {
    const db = await getDB();
    await tx(db, 'readwrite', (s) => s.delete(key));
  },
};
