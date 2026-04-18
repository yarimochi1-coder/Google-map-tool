import {
  getAllSyncQueue,
  removeSyncQueueItem,
  addToSyncQueue,
  getAllProperties as getLocalProperties,
  putAllProperties,
  setMeta,
} from './db';
import { gasPost, gasGet } from './gasClient';
import type { Property, SyncQueueItem } from '../types';

const MAX_RETRIES = 5;

// 同時実行防止フラグ
let isProcessing = false;

export async function processQueue(): Promise<{ synced: number; failed: number }> {
  if (isProcessing) return { synced: 0, failed: 0 };
  isProcessing = true;
  try {
    return await _processQueueImpl();
  } finally {
    isProcessing = false;
  }
}

async function _processQueueImpl(): Promise<{ synced: number; failed: number }> {
  const queue = await getAllSyncQueue();
  let synced = 0;
  let failed = 0;

  for (const item of queue) {
    try {
      const res = await gasPost({
        action: item.action,
        data: item.data,
      });

      if (res.success) {
        await removeSyncQueueItem(item.id);
        synced++;
      } else {
        throw new Error(res.error ?? 'Unknown error');
      }
    } catch {
      if (item.retryCount >= MAX_RETRIES) {
        await removeSyncQueueItem(item.id);
        failed++;
        console.error(`Sync failed permanently for ${item.id}:`, item);
      } else {
        await addToSyncQueue({
          ...item,
          retryCount: item.retryCount + 1,
        });
      }
    }
  }

  return { synced, failed };
}

export async function fullSync(): Promise<Property[]> {
  const localData = await getLocalProperties();

  let serverData: Property[] = [];
  try {
    const res = await gasGet<Property[]>('list');
    if (res.success && res.data) {
      serverData = res.data;
    }
  } catch {
    // Network error: keep local data, don't wipe anything
    console.warn('Full sync failed, keeping local data');
    return localData;
  }

  // SAFETY: Never replace local data with empty server data
  // if local has records. This prevents accidental data loss.
  if (serverData.length === 0 && localData.length > 0) {
    console.warn('Server returned empty data but local has records. Keeping local data.');
    return localData;
  }

  // Merge: keep local records that don't exist on server (unsynced creates)
  const pendingQueue = await getAllSyncQueue();
  const pendingCreateIds = new Set(
    pendingQueue
      .filter((q) => q.action === 'create')
      .map((q) => q.data.id)
  );

  // ID が無いデータは除外（破損データ対策）
  const validServerData = serverData.filter((p) => p.id && typeof p.id === 'string');
  const validLocalData = localData.filter((p) => p.id && typeof p.id === 'string');

  const serverIds = new Set(validServerData.map((p) => p.id));
  const localOnlyRecords = validLocalData.filter(
    (p) => !serverIds.has(p.id) && pendingCreateIds.has(p.id)
  );

  // IDベースで重複除外（サーバー側を優先、ローカルのみのcreate待ちを追加）
  const mergedMap = new Map<string, Property>();
  for (const p of validServerData) {
    mergedMap.set(p.id, p);
  }
  for (const p of localOnlyRecords) {
    if (!mergedMap.has(p.id)) mergedMap.set(p.id, p);
  }
  const merged = Array.from(mergedMap.values());
  await putAllProperties(merged);
  await setMeta('lastSyncTime', new Date().toISOString());
  return merged;
}

export function createSyncQueueItem(
  action: SyncQueueItem['action'],
  data: SyncQueueItem['data']
): SyncQueueItem {
  return {
    id: crypto.randomUUID(),
    action,
    data,
    timestamp: Date.now(),
    retryCount: 0,
  };
}
