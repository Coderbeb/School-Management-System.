/**
 * Offline Queue for Attendance Records
 * Uses IndexedDB to store attendance data when offline
 * and sync when back online.
 */

const DB_NAME = 'ysm-attendance-offline';
const DB_VERSION = 1;
const STORE_NAME = 'offline-attendance-queue';

interface QueueItem {
  id?: number;
  url: string;
  body: {
    records: { studentId: string; status: string }[];
    subjectId: string;
    date: string;
    sessionLectureNumber?: number | null;
  };
  authHeader: string;
  timestamp: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Add a failed attendance request to the offline queue */
export async function addToQueue(item: Omit<QueueItem, 'id'>): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).add(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Get all items from the offline queue */
export async function getQueueItems(): Promise<QueueItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Get count of pending items */
export async function getQueueCount(): Promise<number> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).count();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/** Clear all items from the queue */
export async function clearQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Flush the queue - replay all pending requests to the server */
export async function flushQueue(): Promise<{ success: number; failed: number }> {
  const items = await getQueueItems();
  if (items.length === 0) return { success: 0, failed: 0 };

  let success = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const response = await fetch(item.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: item.authHeader,
        },
        body: JSON.stringify(item.body),
      });

      if (response.ok) {
        success++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  if (failed === 0) {
    await clearQueue();
  }

  return { success, failed };
}
