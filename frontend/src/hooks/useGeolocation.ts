import { useState, useEffect, useCallback, useRef } from 'react';

interface GeoState {
  position: { lat: number; lng: number } | null;
  accuracy: number | null;
  error: string | null;
  isTracking: boolean;
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    position: null,
    accuracy: null,
    error: null,
    isTracking: false,
  });
  const watchIdRef = useRef<number | null>(null);

  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      setState((s) => ({ ...s, error: 'GPS非対応' }));
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setState({
          position: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          accuracy: pos.coords.accuracy,
          error: null,
          isTracking: true,
        });
      },
      (err) => {
        setState((s) => ({ ...s, error: err.message, isTracking: false }));
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    watchIdRef.current = id;
    setState((s) => ({ ...s, isTracking: true }));
  }, []);

  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setState((s) => ({ ...s, isTracking: false }));
  }, []);

  useEffect(() => {
    startTracking();
    return stopTracking;
  }, [startTracking, stopTracking]);

  return { ...state, startTracking, stopTracking };
}
