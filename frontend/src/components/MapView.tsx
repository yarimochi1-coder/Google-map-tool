import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import Supercluster from 'supercluster';
import type { Property } from '../types';
import { MarkerPin } from './MarkerPin';
import { ClusterMarker } from './ClusterMarker';
import { SearchBar } from './SearchBar';
import { SyncIndicator } from './SyncIndicator';
import { useGeolocation } from '../hooks/useGeolocation';
import { useDeviceHeading } from '../hooks/useDeviceHeading';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string;

// Zoom level above which individual pins are shown (no clustering)
const CLUSTER_MAX_ZOOM = 17;

interface MapViewProps {
  properties: Property[];
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  onSelectProperty: (property: Property) => void;
  onAddPin: (lat: number, lng: number, address: string) => void;
}

function MapContent({
  properties,
  isOnline,
  isSyncing,
  pendingCount,
  onSelectProperty,
  onAddPin,
}: MapViewProps) {
  const map = useMap();
  const { position: userPosition } = useGeolocation();
  const { heading, start: startCompass, stop: stopCompass } = useDeviceHeading();

  // Compass/heading mode: rotate map to match device direction
  const [headingMode, setHeadingMode] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressCoord = useRef<{ lat: number; lng: number } | null>(null);
  const pressStartPos = useRef<{ x: number; y: number } | null>(null);
  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(15);
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  // Follow mode
  const [isFollowing, setIsFollowing] = useState(true);

  useEffect(() => {
    if (userPosition && map && isFollowing) {
      map.panTo(userPosition);
    }
  }, [userPosition, map, isFollowing]);

  const hasCentered = useRef(false);
  useEffect(() => {
    if (userPosition && map && !hasCentered.current) {
      map.setZoom(17);
      hasCentered.current = true;
    }
  }, [userPosition, map]);

  // Apply heading to map rotation
  useEffect(() => {
    if (headingMode && heading !== null && map) {
      map.setHeading(heading);
    }
  }, [heading, headingMode, map]);

  // Detect real pan (not pinch zoom) by checking center distance
  const handleIdle = useCallback(() => {
    if (!map || !isFollowing) return;
    const center = map.getCenter();
    if (!center || !userPosition) return;

    const dist = Math.sqrt(
      Math.pow(center.lat() - userPosition.lat, 2) +
      Math.pow(center.lng() - userPosition.lng, 2)
    );

    // If center moved far from user position, user panned the map
    if (dist > 0.0005) {
      setIsFollowing(false);
      setHeadingMode(false);
      stopCompass();
      map.setHeading(0);
      map.setTilt(0);
    }
  }, [map, isFollowing, userPosition, stopCompass]);

  // 3 states: not following → following (north up) → heading mode (compass)
  const handleCenterOnUser = useCallback(async () => {
    if (!userPosition || !map) return;

    if (!isFollowing) {
      // State 1 → 2: Start following (north up)
      map.panTo(userPosition);
      map.setZoom(18);
      map.setHeading(0);
      map.setTilt(0);
      setIsFollowing(true);
      setHeadingMode(false);
    } else if (!headingMode) {
      // State 2 → 3: Enable compass heading mode
      const started = await startCompass();
      if (started) {
        setHeadingMode(true);
        map.setTilt(45);
      }
    } else {
      // State 3 → 1: Disable everything
      setIsFollowing(false);
      setHeadingMode(false);
      stopCompass();
      map.setHeading(0);
      map.setTilt(0);
    }
  }, [userPosition, map, isFollowing, headingMode, startCompass, stopCompass]);

  // Supercluster indexes at different radii for hierarchical clustering
  // Low zoom (far out) = large radius (prefecture/city level)
  // High zoom (close in) = small radius (neighborhood level)
  const clusterIndexes = useMemo(() => {
    const points = properties.map((p, i) => ({
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [p.lng, p.lat] },
      properties: { propertyIndex: i },
    }));

    const configs = [
      { minZoom: 0, maxZoom: 7, radius: 200 },   // 県レベル
      { minZoom: 8, maxZoom: 10, radius: 150 },   // 市レベル
      { minZoom: 11, maxZoom: 13, radius: 100 },  // 区・町レベル
      { minZoom: 14, maxZoom: CLUSTER_MAX_ZOOM, radius: 60 }, // 番地レベル
    ];

    return configs.map((cfg) => {
      const index = new Supercluster<{ propertyIndex: number }>({
        radius: cfg.radius,
        maxZoom: cfg.maxZoom,
        minZoom: cfg.minZoom,
      });
      index.load(points);
      return { ...cfg, index };
    });
  }, [properties]);

  // Pick the right cluster index for current zoom
  const clusterIndex = useMemo(() => {
    const z = Math.floor(zoom);
    const match = clusterIndexes.find((c) => z >= c.minZoom && z <= c.maxZoom);
    return match?.index ?? clusterIndexes[clusterIndexes.length - 1].index;
  }, [zoom, clusterIndexes]);

  // Get clusters or individual points based on current viewport
  const markers = useMemo(() => {
    if (!bounds) return { clusters: [], singles: properties };

    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const bbox: [number, number, number, number] = [
      sw.lng(), sw.lat(), ne.lng(), ne.lat(),
    ];

    const rawClusters = clusterIndex.getClusters(bbox, Math.floor(zoom));

    const clusters: { id: number; lat: number; lng: number; properties: Property[] }[] = [];
    const singles: Property[] = [];

    for (const c of rawClusters) {
      const [lng, lat] = c.geometry.coordinates;
      const props = c.properties as Record<string, unknown>;
      if (props.cluster) {
        const clusterId = props.cluster_id as number;
        const leaves = clusterIndex.getLeaves(clusterId, Infinity);
        const clusterProps = leaves.map((l) => properties[l.properties.propertyIndex]);
        clusters.push({
          id: clusterId,
          lat,
          lng,
          properties: clusterProps,
        });
      } else {
        singles.push(properties[(props as { propertyIndex: number }).propertyIndex]);
      }
    }

    return { clusters, singles };
  }, [bounds, zoom, clusterIndex, properties]);

  const handleBoundsChanged = useCallback(() => {
    if (map) {
      setBounds(map.getBounds() ?? null);
      setZoom(map.getZoom() ?? 15);
    }
  }, [map]);

  const handleClusterClick = useCallback(
    (lat: number, lng: number) => {
      if (!map) return;
      setIsFollowing(false);
      map.panTo({ lat, lng });
      map.setZoom((map.getZoom() ?? 15) + 2);
    },
    [map]
  );

  // Overlay for accurate screen→latlng projection
  const overlayRef = useRef<google.maps.OverlayView | null>(null);
  useEffect(() => {
    if (!map) return;
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {};
    overlay.onRemove = () => {};
    overlay.draw = () => {};
    overlay.setMap(map);
    overlayRef.current = overlay;
    return () => {
      overlay.setMap(null);
      overlayRef.current = null;
    };
  }, [map]);

  // Convert screen coordinates to lat/lng using proper Mercator projection
  const screenToLatLng = useCallback(
    (clientX: number, clientY: number) => {
      if (!map) return null;
      const mapDiv = map.getDiv();
      const rect = mapDiv.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;

      const projection = overlayRef.current?.getProjection();
      if (projection) {
        const latLng = projection.fromContainerPixelToLatLng(
          new google.maps.Point(x, y)
        );
        if (latLng) {
          return { lat: latLng.lat(), lng: latLng.lng() };
        }
      }

      // Fallback: simple bounds interpolation
      const ne = map.getBounds()?.getNorthEast();
      const sw = map.getBounds()?.getSouthWest();
      if (!ne || !sw) return null;
      const lat = ne.lat() - (y / rect.height) * (ne.lat() - sw.lat());
      const lng = sw.lng() + (x / rect.width) * (ne.lng() - sw.lng());
      return { lat, lng };
    },
    [map]
  );

  const cancelLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    pressStartPos.current = null;
  }, []);

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (e.touches.length !== 1) {
        cancelLongPress();
        return;
      }
      const touch = e.touches[0];
      pressStartPos.current = { x: touch.clientX, y: touch.clientY };
      longPressTimer.current = setTimeout(() => {
        const coords = screenToLatLng(touch.clientX, touch.clientY);
        if (coords) {
          longPressCoord.current = coords;
          onAddPin(coords.lat, coords.lng, '');
        }
        pressStartPos.current = null;
      }, LONG_PRESS_MS);
    },
    [screenToLatLng, onAddPin, cancelLongPress]
  );

  const handleTouchEnd = useCallback(() => {
    cancelLongPress();
  }, [cancelLongPress]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length > 1) {
      cancelLongPress();
      return;
    }
    if (!pressStartPos.current || !longPressTimer.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - pressStartPos.current.x;
    const dy = touch.clientY - pressStartPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      cancelLongPress();
    }
  }, [cancelLongPress]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      pressStartPos.current = { x: e.clientX, y: e.clientY };
      longPressTimer.current = setTimeout(() => {
        const coords = screenToLatLng(e.clientX, e.clientY);
        if (coords) {
          longPressCoord.current = coords;
          onAddPin(coords.lat, coords.lng, '');
        }
        pressStartPos.current = null;
      }, LONG_PRESS_MS);
    },
    [screenToLatLng, onAddPin]
  );

  const handleMouseUp = useCallback(() => {
    cancelLongPress();
  }, [cancelLongPress]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!pressStartPos.current || !longPressTimer.current) return;
    const dx = e.clientX - pressStartPos.current.x;
    const dy = e.clientY - pressStartPos.current.y;
    if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) {
      cancelLongPress();
    }
  }, [cancelLongPress]);

  const handlePlaceSelect = useCallback(
    (location: { lat: number; lng: number; address: string }) => {
      setIsFollowing(false);
      map?.panTo({ lat: location.lat, lng: location.lng });
      map?.setZoom(18);
    },
    [map]
  );

  return (
    <div
      className="relative w-full h-full"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchMove={handleTouchMove}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseMove={handleMouseMove}
    >
      <SearchBar onPlaceSelect={handlePlaceSelect} />
      <SyncIndicator isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingCount} />

      <Map
        mapId={MAP_ID}
        defaultCenter={userPosition ?? { lat: 35.68, lng: 139.76 }}
        defaultZoom={15}
        mapTypeId="satellite"
        gestureHandling="greedy"
        disableDefaultUI={true}
        zoomControl={true}
        onBoundsChanged={handleBoundsChanged}
        onIdle={handleIdle}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Cluster markers */}
        {markers.clusters.map((c) => (
          <AdvancedMarker
            key={`cluster-${c.id}`}
            position={{ lat: c.lat, lng: c.lng }}
          >
            <ClusterMarker
              properties={c.properties}
              zoom={zoom}
              onClick={() => handleClusterClick(c.lat, c.lng)}
            />
          </AdvancedMarker>
        ))}

        {/* Individual markers */}
        {markers.singles.map((p) => (
          <AdvancedMarker
            key={p.id}
            position={{ lat: p.lat, lng: p.lng }}
            onClick={() => onSelectProperty(p)}
          >
            <MarkerPin status={p.status} name={p.name} />
          </AdvancedMarker>
        ))}

        {/* GPS blue dot with direction */}
        {userPosition && (
          <AdvancedMarker position={userPosition}>
            <div className="relative flex items-center justify-center">
              {headingMode && heading !== null && (
                <div
                  className="absolute w-10 h-10"
                  style={{
                    background: 'conic-gradient(from -15deg, rgba(33,150,243,0.3), rgba(33,150,243,0) 30deg)',
                    borderRadius: '50%',
                    transform: `rotate(${heading - (map?.getHeading() ?? 0)}deg)`,
                  }}
                />
              )}
              <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-lg animate-pulse" />
            </div>
          </AdvancedMarker>
        )}
      </Map>

      {/* Center on user / follow / compass button */}
      <button
        onClick={handleCenterOnUser}
        className={`absolute bottom-6 right-3 z-40 w-12 h-12 rounded-full shadow-lg flex items-center justify-center active:scale-95 transition-all ${
          headingMode ? 'bg-blue-600' : isFollowing ? 'bg-blue-500' : 'bg-white'
        }`}
        title={headingMode ? 'コンパスモード' : isFollowing ? '追従中' : '現在地'}
      >
        {headingMode ? (
          // Compass icon
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <polygon points="12,2 15,14 12,12 9,14" fill="#fff" />
            <polygon points="12,22 9,14 12,12 15,14" fill="rgba(255,255,255,0.4)" />
          </svg>
        ) : (
          // Location icon
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke={isFollowing ? '#fff' : '#2196F3'}
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
          </svg>
        )}
      </button>
    </div>
  );
}

export function MapView(props: MapViewProps) {
  return (
    <APIProvider apiKey={API_KEY} libraries={['places']}>
      <MapContent {...props} />
    </APIProvider>
  );
}
