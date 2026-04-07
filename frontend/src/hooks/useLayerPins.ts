import { useState, useEffect, useCallback } from 'react';
import type { LayerPin, MarkerLayer } from '../types';

const STORAGE_KEY = 'paint-map-layer-pins';

function loadPins(): LayerPin[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

function savePins(pins: LayerPin[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
}

export function useLayerPins() {
  const [pins, setPins] = useState<LayerPin[]>(loadPins);

  useEffect(() => {
    savePins(pins);
  }, [pins]);

  const addPin = useCallback((data: Omit<LayerPin, 'id' | 'created_at'>) => {
    const pin: LayerPin = {
      ...data,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setPins((prev) => [...prev, pin]);
    return pin;
  }, []);

  const removePin = useCallback((id: string) => {
    setPins((prev) => prev.filter((p) => p.id !== id));
  }, []);

  const importPins = useCallback((newPins: LayerPin[]) => {
    setPins((prev) => [...prev, ...newPins]);
  }, []);

  const getPinsByLayer = useCallback((layer: MarkerLayer) => {
    return pins.filter((p) => p.layer === layer);
  }, [pins]);

  return { pins, addPin, removePin, importPins, getPinsByLayer };
}
