/**
 * handleStore — thin IndexedDB wrapper for FileSystemDirectoryHandle persistence.
 *
 * DB name:   VibelaPersistence
 * Store:     directoryHandles (keyPath: 'id')
 * Key:       'project_' + window.location.origin
 *
 * This module is a pure storage wrapper. It does NOT invoke showDirectoryPicker,
 * does NOT wire any UI, and does NOT request permissions. Permission flows live
 * in projectSync.ts (batch 2).
 */

const DB_NAME    = 'VibelaPersistence';
const DB_VERSION = 1;
const STORE_NAME = 'directoryHandles';

interface HandleRecord {
  id: string;
  rootHandle: FileSystemDirectoryHandle;
  origin: string;
  path: string;
  connectedAt: string;
}

// ---------------------------------------------------------------------------
// Internal: open / lazy-init
// ---------------------------------------------------------------------------

let _db: IDBDatabase | null = null;

function openDB(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db);

  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onerror = () => reject(req.error);

    req.onsuccess = () => {
      _db = req.result;
      resolve(_db);
    };

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('origin', 'origin', { unique: false });
      }
    };
  });
}

function stableKey(): string {
  return `project_${window.location.origin}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Persist a FileSystemDirectoryHandle and its resolved path.
 * Uses `put` so subsequent calls for the same origin overwrite the previous record.
 */
export async function save(
  handle: FileSystemDirectoryHandle,
  path: string,
): Promise<void> {
  const db = await openDB();
  const record: HandleRecord = {
    id: stableKey(),
    rootHandle: handle,
    origin: window.location.origin,
    path,
    connectedAt: new Date().toISOString(),
  };

  return new Promise<void>((resolve, reject) => {
    const tx  = db.transaction([STORE_NAME], 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(record);
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}

/**
 * Retrieve the stored handle for the current origin.
 * Returns null if nothing has been stored yet.
 */
export async function load(): Promise<{ handle: FileSystemDirectoryHandle; path: string } | null> {
  const db = await openDB();

  return new Promise<{ handle: FileSystemDirectoryHandle; path: string } | null>((resolve, reject) => {
    const tx  = db.transaction([STORE_NAME], 'readonly');
    const req = tx.objectStore(STORE_NAME).get(stableKey());

    req.onsuccess = () => {
      const result = req.result as HandleRecord | undefined;
      if (result?.rootHandle) {
        resolve({ handle: result.rootHandle, path: result.path });
      } else {
        resolve(null);
      }
    };

    req.onerror = () => reject(req.error);
  });
}

/**
 * Remove the stored handle for the current origin.
 */
export async function clear(): Promise<void> {
  const db = await openDB();

  return new Promise<void>((resolve, reject) => {
    const tx  = db.transaction([STORE_NAME], 'readwrite');
    const req = tx.objectStore(STORE_NAME).delete(stableKey());
    req.onsuccess = () => resolve();
    req.onerror   = () => reject(req.error);
  });
}
