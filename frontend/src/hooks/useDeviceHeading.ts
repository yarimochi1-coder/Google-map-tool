import { useState, useEffect, useCallback, useRef } from 'react';

export function useDeviceHeading() {
  const [heading, setHeading] = useState<number | null>(null);
  const [isActive, setIsActive] = useState(false);
  const listenerRef = useRef<((e: DeviceOrientationEvent) => void) | null>(null);

  const start = useCallback(async () => {
    // iOS 13+ requires permission
    const doe = DeviceOrientationEvent as unknown as {
      requestPermission?: () => Promise<string>;
    };
    if (doe.requestPermission) {
      try {
        const permission = await doe.requestPermission();
        if (permission !== 'granted') return false;
      } catch {
        return false;
      }
    }

    const handler = (e: DeviceOrientationEvent) => {
      // Use webkitCompassHeading for iOS, alpha for Android
      const evt = e as DeviceOrientationEvent & { webkitCompassHeading?: number };
      let h: number | null = null;

      if (typeof evt.webkitCompassHeading === 'number') {
        h = evt.webkitCompassHeading;
      } else if (typeof e.alpha === 'number' && e.absolute) {
        h = (360 - e.alpha) % 360;
      } else if (typeof e.alpha === 'number') {
        h = (360 - e.alpha) % 360;
      }

      if (h !== null) setHeading(h);
    };

    window.addEventListener('deviceorientation', handler, true);
    listenerRef.current = handler;
    setIsActive(true);
    return true;
  }, []);

  const stop = useCallback(() => {
    if (listenerRef.current) {
      window.removeEventListener('deviceorientation', listenerRef.current, true);
      listenerRef.current = null;
    }
    setIsActive(false);
    setHeading(null);
  }, []);

  useEffect(() => {
    return () => {
      if (listenerRef.current) {
        window.removeEventListener('deviceorientation', listenerRef.current, true);
      }
    };
  }, []);

  return { heading, isActive, start, stop };
}
