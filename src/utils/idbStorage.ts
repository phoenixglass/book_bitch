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

  async setItem(key: string, value: string): Promise<void> {
    const db = await getDB();
    await tx(db, 'readwrite', (s) => s.put(value, key));
  },

  async removeItem(key: string): Promise<void> {
    const db = await getDB();
    await tx(db, 'readwrite', (s) => s.delete(key));
  },
};
