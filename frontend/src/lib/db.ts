import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Property, SyncQueueItem } from '../types';

interface AppDB extends DBSchema {
  properties: {
    key: string;
    value: Property;
    indexes: {
      'by-status': string;
      'by-updated': string;
    };
  };
  syncQueue: {
    key: string;
    value: SyncQueueItem;
    indexes: {
      'by-timestamp': number;
    };
  };
  metadata: {
    key: string;
    value: { key: string; value: string };
  };
}

let dbInstance: IDBPDatabase<AppDB> | null = null;

export async function getDB(): Promise<IDBPDatabase<AppDB>> {
  if (dbInstance) return dbInstance;

  dbInstance = await openDB<AppDB>('paint-map-app', 1, {
    upgrade(db) {
      // Only create stores if they don't exist (safe for upgrades)
      if (!db.objectStoreNames.contains('properties')) {
        const propertyStore = db.createObjectStore('properties', { keyPath: 'id' });
        propertyStore.createIndex('by-status', 'status');
        propertyStore.createIndex('by-updated', 'updated_at');
      }

      if (!db.objectStoreNames.contains('syncQueue')) {
        const syncStore = db.createObjectStore('syncQueue', { keyPath: 'id' });
        syncStore.createIndex('by-timestamp', 'timestamp');
      }

      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' });
      }
    },
  });

  return dbInstance;
}

// Properties CRUD
export async function getAllProperties(): Promise<Property[]> {
  const db = await getDB();
  return db.getAll('properties');
}

export async function getProperty(id: string): Promise<Property | undefined> {
  const db = await getDB();
  return db.get('properties', id);
}

export async function putProperty(property: Property): Promise<void> {
  const db = await getDB();
  await db.put('properties', property);
}

export async function deleteProperty(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('properties', id);
}

export async function putAllProperties(properties: Property[]): Promise<void> {
  const db = await getDB();
  const tx = db.transaction('properties', 'readwrite');
  await Promise.all([
    ...properties.map((p) => tx.store.put(p)),
    tx.done,
  ]);
}

// Sync Queue
export async function addToSyncQueue(item: SyncQueueItem): Promise<void> {
  const db = await getDB();
  await db.put('syncQueue', item);
}

export async function getAllSyncQueue(): Promise<SyncQueueItem[]> {
  const db = await getDB();
  return db.getAllFromIndex('syncQueue', 'by-timestamp');
}

export async function removeSyncQueueItem(id: string): Promise<void> {
  const db = await getDB();
  await db.delete('syncQueue', id);
}

export async function clearSyncQueue(): Promise<void> {
  const db = await getDB();
  await db.clear('syncQueue');
}

// Metadata
export async function getMeta(key: string): Promise<string | undefined> {
  const db = await getDB();
  const record = await db.get('metadata', key);
  return record?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.put('metadata', { key, value });
}
