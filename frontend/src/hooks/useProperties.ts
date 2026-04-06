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
      setProperties(local);
      const pending = await db.getAllSyncQueue();
      setPendingCount(pending.length);
      const lastSync = await db.getMeta('lastSyncTime');
      if (lastSync) setLastSyncTime(lastSync);
    })();
  }, []);

  const doSync = useCallback(async () => {
    if (!isOnline) return;
    setIsSyncing(true);
    try {
      await processQueue();
      const serverData = await fullSync();
      setProperties(serverData);
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
      const prop = properties.find((p) => p.id === id);
      await updateProperty(id, {
        status,
        staff: getStaff(),
        last_visit_date: now,
        visit_count: (prop?.visit_count ?? 0) + 1,
      });
      // Log to visit history
      await logVisit(id, status);
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
    isSyncing,
    pendingCount,
    lastSyncTime,
    forceSync: doSync,
  };
}
