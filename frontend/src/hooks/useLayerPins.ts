import { useState, useEffect, useCallback } from 'react';
import type { LayerPin, MarkerLayer } from '../types';
import { gasGet, gasPost } from '../lib/gasClient';

const STORAGE_KEY = 'paint-map-layer-pins';

function loadLocal(): LayerPin[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function saveLocal(pins: LayerPin[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}

export function useLayerPins() {
  const [pins, setPins] = useState<LayerPin[]>(loadLocal);

  // Persist locally as cache
  useEffect(() => {
    saveLocal(pins);
  }, [pins]);

  // Fetch from server on mount
  useEffect(() => {
    gasGet<LayerPin[]>('layer_pins').then((res) => {
      if (res.success && res.data && Array.isArray(res.data)) {
        // Merge with local: prefer server data, but keep local-only items
        setPins((local) => {
          const serverIds = new Set(res.data!.map((p) => p.id));
          const localOnly = local.filter((p) => !serverIds.has(p.id));
          return [...res.data!, ...localOnly];
        });
      }
    }).catch(() => {});
  }, []);

  const addPin = useCallback(async (data: Omit<LayerPin, 'id' | 'created_at'>) => {
    const pin: LayerPin = {
      ...data,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setPins((prev) => [...prev, pin]);
    // Sync to server
    gasPost({ action: 'create_layer_pin', data: pin }).catch(() => {});
    return pin;
  }, []);

  const removePin = useCallback(async (id: string) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
    gasPost({ action: 'delete_layer_pin', data: { id } }).catch(() => {});
  }, []);

  const updatePin = useCallback(async (id: string, changes: Partial<LayerPin>) => {
    setPins((prev) => prev.map((p) => (p.id === id ? { ...p, ...changes } : p)));
    const updated = { ...changes, id };
    gasPost({ action: 'update_layer_pin', data: updated }).catch(() => {});
  }, []);

  const importPins = useCallback(async (newPins: LayerPin[]) => {
    setPins((prev) => [...prev, ...newPins]);
    // Bulk import to server
    gasPost({ action: 'import_layer_pins', data: newPins }).catch(() => {});
  }, []);

  const getPinsByLayer = useCallback((layer: MarkerLayer) => {
    return pins.filter((p) => p.layer === layer);
  }, [pins]);

  return { pins, addPin, removePin, updatePin, importPins, getPinsByLayer };
}
