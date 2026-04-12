import { useState, useEffect, useCallback, useRef } from 'react';
import type { Property, PropertyStatus } from '../types';
import * as db from '../lib/db';
import { processQueue, fullSync, createSyncQueueItem } from '../lib/syncEngine';
import { useOnlineStatus } from './useOnlineStatus';

export function useProperties() {
  const [properties, setProperties] = useState<Property[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const isOnline = useOnlineStatus();
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    (async () => {
      const local = await db.getAllProperties();
      setProperties(dedup(local));
      const pending = await db.getAllSyncQueue();
      setPendingCount(pending.length);
      const lastSync = await db.getMeta('lastSyncTime');
      if (lastSync) setLastSyncTime(lastSync);
    })();
  }, []);

  const dedup = (props: Property[]): Property[] => {
    const map = new Map<string, Property>();
    for (const p of props) {
      if (p.id) map.set(p.id, p);
    }
    return Array.from(map.values());
  };

  const doSync = useCallback(async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      await processQueue();
      const serverData = await fullSync();
      setProperties(dedup(serverData));
      const pending = await db.getAllSyncQueue();
      setPendingCount(pending.length);
      setLastSyncTime(new Date().toISOString());
    } catch (e) {
      console.warn('Sync failed:', e);
    } finally {
      setIsSyncing(false);
    }
  }, [isOnline]);

  useEffect(() => {
    if (isOnline) {
      doSync();
      syncIntervalRef.current = setInterval(doSync, 5 * 60 * 1000);
    }
    return () => {
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isOnline, doSync]);

  const triggerSync = useCallback(() => {
    if (isOnline) processQueue().then(() => db.getAllSyncQueue().then((q) => setPendingCount(q.length)));
  }, [isOnline]);

  const getStaff = () => localStorage.getItem('paint-map-username') ?? '';

  // Log visit to history (every status change / visit is recorded)
  const logVisit = useCallback(
    async (propertyId: string, status: PropertyStatus, memo = '') => {
      const visitData = {
        id: crypto.randomUUID(),
        property_id: propertyId,
        status,
        staff: getStaff(),
        visited_at: new Date().toLocaleString('ja-JP'),
        memo,
      };
      const queueItem = createSyncQueueItem('log_visit', visitData as unknown as Property);
      await db.addToSyncQueue(queueItem);
      setPendingCount((c) => c + 1);
      triggerSync();
    },
    [triggerSync]
  );

  const addProperty = useCallback(
    async (data: Omit<Property, 'id' | 'created_at' | 'updated_at' | 'visit_count'>) => {
      const now = new Date().toISOString();
      const property: Property = {
        ...data,
        id: crypto.randomUUID(),
        created_at: now,
        updated_at: now,
        visit_count: 0,
      };

      setProperties((prev) => [...prev, property]);
      await db.putProperty(property);

      const queueItem = createSyncQueueItem('create', property);
      await db.addToSyncQueue(queueItem);
      setPendingCount((c) => c + 1);

      // Log initial visit
      await logVisit(property.id, property.status);

      triggerSync();
      return property;
    },
    [logVisit, triggerSync]
  );

  const updateProperty = useCallback(
    async (id: string, changes: Partial<Property>) => {
      const updated = { ...changes, id, updated_at: new Date().toISOString() };

      setProperties((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updated } : p))
      );

      const existing = await db.getProperty(id);
      if (existing) {
        await db.putProperty({ ...existing, ...updated });
      }

      const queueItem = createSyncQueueItem('update', updated as Property);
      await db.addToSyncQueue(queueItem);
      setPendingCount((c) => c + 1);
      triggerSync();
    },
    [triggerSync]
  );

  const updateStatus = useCallback(
    async (id: string, status: PropertyStatus) => {
      const now = new Date().toLocaleString('ja-JP');
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const prop = properties.find((p) => p.id === id);

      // 同日にすでに訪問記録済みならvisit_countを増やさない（ステータス修正扱い）
      const lastDate = prop?.last_visit_date || '';
      // "2026/4/12 14:30" → "2026-04-12" にゼロ埋めして正規化
      const rawParts = lastDate.split(' ')[0].split('T')[0].replace(/\//g, '-');
      const m = rawParts.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      const lastDatePart = m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : '';
      const alreadyVisitedToday = lastDatePart === todayStr;

      await updateProperty(id, {
        status,
        staff: getStaff(),
        last_visit_date: now,
        visit_count: alreadyVisitedToday
          ? (prop?.visit_count ?? 0)
          : (prop?.visit_count ?? 0) + 1,
      });
      // 同日修正でもhistoryには記録（分析用）
      await logVisit(id, status, alreadyVisitedToday ? 'ステータス修正' : '');
    },
    [updateProperty, logVisit, properties]
  );

  const incrementVisit = useCallback(
    async (id: string) => {
      const prop = properties.find((p) => p.id === id);
      if (!prop) return;
      await updateProperty(id, {
        visit_count: prop.visit_count + 1,
        staff: getStaff(),
        last_visit_date: new Date().toLocaleString('ja-JP'),
      });
      await logVisit(id, prop.status, '再訪問');
    },
    [properties, updateProperty, logVisit]
  );

  const clearAllLocal = useCallback(async () => {
    setProperties([]);
    setPendingCount(0);
    // Delete IndexedDB
    await new Promise<void>((resolve) => {
      const req = indexedDB.deleteDatabase('paint-map-app');
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    });
    // Also clear localStorage layer pins
    localStorage.removeItem('paint-map-layer-pins');
  }, []);

  const removeProperty = useCallback(
    async (id: string) => {
      setProperties((prev) => prev.filter((p) => p.id !== id));
      await db.deleteProperty(id);
      const queueItem = createSyncQueueItem('delete', { id } as Property);
      await db.addToSyncQueue(queueItem);
      setPendingCount((c) => c + 1);
      triggerSync();
    },
    [triggerSync]
  );

  const importProperties = useCallback(
    async (items: Property[]) => {
      setProperties((prev) => [...prev, ...items]);
      for (const item of items) {
        await db.putProperty(item);
        const queueItem = createSyncQueueItem('create', item);
        await db.addToSyncQueue(queueItem);
      }
      setPendingCount((c) => c + items.length);
      triggerSync();
    },
    [triggerSync]
  );

  return {
    properties,
    addProperty,
    updateProperty,
    updateStatus,
    incrementVisit,
    removeProperty,
    importProperties,
    clearAllLocal,
    isSyncing,
    pendingCount,
    lastSyncTime,
    forceSync: doSync,
  };
}
