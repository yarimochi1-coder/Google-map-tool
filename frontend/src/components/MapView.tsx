import { useState, useCallback, useRef, useMemo, useEffect, memo } from 'react';
import {
  APIProvider,
  Map,
  AdvancedMarker,
  useMap,
} from '@vis.gl/react-google-maps';
import type { Property, LayerPin, PropertyStatus } from '../types';
import { getStatusConfig } from '../lib/statusConfig';

const LAYER_STYLES = {
  our_work: { bg: '#4CAF50', icon: '🏠', label: '自社施工' },
  target: { bg: '#FF5722', icon: '🎯', label: 'ターゲット' },
} as const;
import { SearchBar } from './SearchBar';
import { SyncIndicator } from './SyncIndicator';
import { useGeolocation } from '../hooks/useGeolocation';
import { useDeviceHeading } from '../hooks/useDeviceHeading';

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string;
const MAP_ID = import.meta.env.VITE_GOOGLE_MAPS_MAP_ID as string;

// 名前ラベルを表示するズーム閾値（これ以上で表示）
const NAME_LABEL_MIN_ZOOM = 16;
// フルサイズピンを表示するズーム閾値（これ以上でフル、未満でドット）
const FULL_PIN_MIN_ZOOM = 14;
// 画面外のピンも少し先まで描いておく割合（少し動かしただけでピンが出たり消えたりしないように）
const BOUNDS_PADDING = 0.25;
// ドット表示のとき、この大きさ(px)の升目ごとに1個だけ描く。ドットは10pxなので見た目はほぼ変わらず、描く数を大きく減らせる
const DOT_CELL_PX = 6;
// 同じ升目に複数あるとき、どのピンを残すか（大きいほど優先）
const STATUS_PRIORITY: Record<PropertyStatus, number> = {
  contract: 11, appointment: 10, measured: 9, ng: 8, instant_return: 7,
  grandfather: 6, grandmother: 5, child: 4, interphone: 3, impossible: 2,
  completed: 1, absent: 0,
};

const PIN_HEAD_STYLE = {
  width: 28, height: 28, borderRadius: '50% 50% 50% 0',
  border: '2px solid #fff',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  color: '#fff', fontSize: 12, fontWeight: 'bold',
  transform: 'rotate(-45deg)', boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
} as const;
const PIN_LABEL_STYLE = {
  fontSize: 10, backgroundColor: 'rgba(255,255,255,0.9)',
  padding: '0 4px', borderRadius: 3, marginTop: 2,
  color: '#333', whiteSpace: 'nowrap', maxWidth: 80,
  overflow: 'hidden', textOverflow: 'ellipsis',
  boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
} as const;
const PIN_WRAPPER_STYLE = { display: 'flex', flexDirection: 'column', alignItems: 'center', transform: 'translate(0, 10px)' } as const;

// ピン1本ずつを memo 化する。GPS の更新や画面の再描画のたびに全ピンの位置を貼り直すと、地図を動かしたときにカクつくため
const PropertyMarker = memo(function PropertyMarker({
  property, isDot, showLabel, onSelect,
}: {
  property: Property;
  isDot: boolean;
  showLabel: boolean;
  onSelect: (p: Property) => void;
}) {
  const cfg = getStatusConfig(property.status);
  const position = useMemo(() => ({ lat: property.lat, lng: property.lng }), [property.lat, property.lng]);
  const handleClick = useCallback(() => onSelect(property), [onSelect, property]);
  return (
    <AdvancedMarker position={position} onClick={handleClick} title={property.name || cfg.label}>
      {isDot ? (
        <div style={{
          width: 10, height: 10, borderRadius: '50%',
          backgroundColor: cfg.color, border: '1.5px solid #fff',
          boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }} />
      ) : (
        <div style={PIN_WRAPPER_STYLE}>
          <div style={{ ...PIN_HEAD_STYLE, backgroundColor: cfg.color }}>
            <span style={{ transform: 'rotate(45deg)' }}>{cfg.icon}</span>
          </div>
          {property.name && showLabel && <span style={PIN_LABEL_STYLE}>{property.name}</span>}
        </div>
      )}
    </AdvancedMarker>
  );
});

const LayerMarker = memo(function LayerMarker({
  pin, onSelect,
}: {
  pin: LayerPin;
  onSelect: (p: LayerPin) => void;
}) {
  const style = pin.layer === 'target' ? LAYER_STYLES.target : LAYER_STYLES.our_work;
  const position = useMemo(() => ({ lat: pin.lat, lng: pin.lng }), [pin.lat, pin.lng]);
  const handleClick = useCallback(() => onSelect(pin), [onSelect, pin]);
  return (
    <AdvancedMarker position={position} title={pin.name} onClick={handleClick}>
      <div style={PIN_WRAPPER_STYLE}>
        <div style={{ ...PIN_HEAD_STYLE, backgroundColor: style.bg, fontWeight: 'normal' }}>
          <span style={{ transform: 'rotate(45deg)' }}>{style.icon}</span>
        </div>
        {pin.name && <span style={PIN_LABEL_STYLE}>{pin.name}</span>}
      </div>
    </AdvancedMarker>
  );
});

interface ViewBox { minLat: number; maxLat: number; minLng: number; maxLng: number }

function inBox(box: ViewBox, lat: number, lng: number): boolean {
  return lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng;
}

interface MapViewProps {
  properties: Property[];
  layerPins: LayerPin[];
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  onSelectProperty: (property: Property) => void;
  onAddPin: (lat: number, lng: number, address: string) => void;
  onAddLayerPin: (lat: number, lng: number, layer: 'our_work' | 'target') => void;
  onSelectLayerPin: (pin: LayerPin) => void;
}

function MapContent({
  properties,
  layerPins,
  isOnline,
  isSyncing,
  pendingCount,
  onSelectProperty,
  onAddPin,
  onAddLayerPin,
  onSelectLayerPin,
}: MapViewProps) {
  const map = useMap();
  const { position: userPosition } = useGeolocation();
  const { heading, start: startCompass, stop: stopCompass } = useDeviceHeading();

  // Layer visibility
  const [showVisit, setShowVisit] = useState(true);
  const [showOurWork, setShowOurWork] = useState(true);
  const [showTarget, setShowTarget] = useState(true);
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  // Add mode: which type of pin to add on long press
  const [addMode, setAddMode] = useState<'visit' | 'our_work' | 'target'>('visit');

  // Compass/heading mode: rotate map to match device direction
  const [headingMode, setHeadingMode] = useState(false);
  const [bounds, setBounds] = useState<google.maps.LatLngBounds | null>(null);
  const [zoom, setZoom] = useState(15);
  const LONG_PRESS_MS = 500;
  const MOVE_THRESHOLD = 10;

  // Follow mode - default OFF, only enabled when user taps center button
  const [isFollowing, setIsFollowing] = useState(false);

  useEffect(() => {
    if (userPosition && map && isFollowing) {
      map.panTo(userPosition);
    }
  }, [userPosition, map, isFollowing]);

  // Center on user once at startup, then stop
  const hasCentered = useRef(false);
  useEffect(() => {
    if (userPosition && map && !hasCentered.current) {
      map.panTo(userPosition);
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
    if (!map) return;
    // 地図の停止後に bounds/zoom を更新（ズーム中の再レンダリングを防ぐ）
    setBounds(map.getBounds() ?? null);
    setZoom(map.getZoom() ?? 15);

    if (!isFollowing) return;
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

  // 表示範囲（少し外側まで広げる）。地図の準備ができるまでは何も描かない
  const viewBox = useMemo<ViewBox | null>(() => {
    if (!bounds) return null;
    const ne = bounds.getNorthEast();
    const sw = bounds.getSouthWest();
    const padLat = (ne.lat() - sw.lat()) * BOUNDS_PADDING;
    const padLng = (ne.lng() - sw.lng()) * BOUNDS_PADDING;
    return {
      minLat: sw.lat() - padLat, maxLat: ne.lat() + padLat,
      minLng: sw.lng() - padLng, maxLng: ne.lng() + padLng,
    };
  }, [bounds]);

  const isDot = zoom < FULL_PIN_MIN_ZOOM;
  const showLabel = zoom >= NAME_LABEL_MIN_ZOOM;

  // 表示範囲内のピンだけ描画。ドット表示のときは重なって見えないピンを間引く
  const visibleProperties = useMemo(() => {
    if (!viewBox) return [];
    const inView = properties.filter((p) => inBox(viewBox, p.lat, p.lng));
    if (!isDot || !map) return inView;

    const div = map.getDiv();
    const cellLat = (viewBox.maxLat - viewBox.minLat) / ((div.clientHeight * (1 + BOUNDS_PADDING * 2)) / DOT_CELL_PX);
    const cellLng = (viewBox.maxLng - viewBox.minLng) / ((div.clientWidth * (1 + BOUNDS_PADDING * 2)) / DOT_CELL_PX);
    if (!(cellLat > 0) || !(cellLng > 0)) return inView;

    const best = new globalThis.Map<string, Property>();
    for (const p of inView) {
      const key = `${Math.floor(p.lat / cellLat)}:${Math.floor(p.lng / cellLng)}`;
      const cur = best.get(key);
      if (!cur || (STATUS_PRIORITY[p.status] ?? 0) > (STATUS_PRIORITY[cur.status] ?? 0)) best.set(key, p);
    }
    return Array.from(best.values());
  }, [viewBox, properties, isDot, map]);

  const visibleLayerPins = useMemo(() => {
    if (!viewBox) return [];
    return layerPins.filter((p) =>
      ((p.layer === 'our_work' && showOurWork) || (p.layer === 'target' && showTarget)) &&
      inBox(viewBox, p.lat, p.lng)
    );
  }, [viewBox, layerPins, showOurWork, showTarget]);


  // bounds/zoom 更新は onIdle に任せて、ここでは何もしない
  // （ズーム/パン中の毎フレーム再レンダリングを防ぐ）

  // Capture accurate lat/lng from Google Maps events
  const lastMapLatLng = useRef<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (!map) return;
    const listeners = [
      // PC: mousemove gives continuous accurate coordinates
      map.addListener('mousemove', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) lastMapLatLng.current = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      }),
      // Both PC & mobile: mousedown fires on touch start too
      map.addListener('mousedown', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) lastMapLatLng.current = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      }),
      // Mobile: click gives accurate lat/lng (fires after touch)
      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) lastMapLatLng.current = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      }),
    ];
    return () => listeners.forEach((l) => google.maps.event.removeListener(l));
  }, [map]);

  // Long press at the touched location (using OverlayView projection)
  const onAddPinRef = useRef(onAddPin);
  onAddPinRef.current = onAddPin;
  const onAddLayerPinRef = useRef(onAddLayerPin);
  onAddLayerPinRef.current = onAddLayerPin;
  const addModeRef = useRef(addMode);
  addModeRef.current = addMode;
  const overlayRef = useRef<google.maps.OverlayView | null>(null);

  const dispatchAdd = useCallback((lat: number, lng: number) => {
    const mode = addModeRef.current;
    if (mode === 'visit') onAddPinRef.current(lat, lng, '');
    else onAddLayerPinRef.current(lat, lng, mode);
  }, []);

  // Setup OverlayView for accurate pixel-to-LatLng conversion
  useEffect(() => {
    if (!map) return;
    const overlay = new google.maps.OverlayView();
    overlay.onAdd = () => {};
    overlay.onRemove = () => {};
    overlay.draw = () => {};
    overlay.setMap(map);
    overlayRef.current = overlay;
    return () => { overlay.setMap(null); overlayRef.current = null; };
  }, [map]);

  useEffect(() => {
    if (!map) return;
    const mapDiv = map.getDiv();
    let timer: ReturnType<typeof setTimeout> | null = null;
    let startPos: { x: number; y: number } | null = null;

    const cancel = () => {
      if (timer) { clearTimeout(timer); timer = null; }
      startPos = null;
    };

    // Convert client (viewport) coords to lat/lng using map's overlay projection
    const clientToLatLng = (clientX: number, clientY: number): { lat: number; lng: number } | null => {
      // Prefer Google Maps native event lat/lng (set by mousemove on PC)
      if (lastMapLatLng.current) {
        const r = lastMapLatLng.current;
        return r;
      }
      const proj = overlayRef.current?.getProjection();
      if (!proj) return null;
      const rect = mapDiv.getBoundingClientRect();
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const ll = proj.fromContainerPixelToLatLng(new google.maps.Point(x, y));
      if (!ll) return null;
      return { lat: ll.lat(), lng: ll.lng() };
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) { cancel(); return; }
      const t = e.touches[0];
      startPos = { x: t.clientX, y: t.clientY };
      const cx = t.clientX, cy = t.clientY;
      timer = setTimeout(() => {
        const coords = clientToLatLng(cx, cy);
        if (coords) dispatchAdd(coords.lat, coords.lng);
        startPos = null;
      }, LONG_PRESS_MS);
    };

    const onTouchEnd = () => cancel();

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 1) { cancel(); return; }
      if (!startPos || !timer) return;
      const t = e.touches[0];
      const dx = t.clientX - startPos.x;
      const dy = t.clientY - startPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) cancel();
    };

    const onMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;
      startPos = { x: e.clientX, y: e.clientY };
      const cx = e.clientX, cy = e.clientY;
      timer = setTimeout(() => {
        const coords = clientToLatLng(cx, cy);
        if (coords) dispatchAdd(coords.lat, coords.lng);
        startPos = null;
      }, LONG_PRESS_MS);
    };

    const onMouseUp = () => cancel();

    const onMouseMoveNative = (e: MouseEvent) => {
      if (!startPos || !timer) return;
      const dx = e.clientX - startPos.x;
      const dy = e.clientY - startPos.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_THRESHOLD) cancel();
    };

    mapDiv.addEventListener('touchstart', onTouchStart, { passive: true });
    mapDiv.addEventListener('touchend', onTouchEnd);
    mapDiv.addEventListener('touchmove', onTouchMove, { passive: true });
    mapDiv.addEventListener('mousedown', onMouseDown);
    mapDiv.addEventListener('mouseup', onMouseUp);
    mapDiv.addEventListener('mousemove', onMouseMoveNative);

    return () => {
      cancel();
      mapDiv.removeEventListener('touchstart', onTouchStart);
      mapDiv.removeEventListener('touchend', onTouchEnd);
      mapDiv.removeEventListener('touchmove', onTouchMove);
      mapDiv.removeEventListener('mousedown', onMouseDown);
      mapDiv.removeEventListener('mouseup', onMouseUp);
      mapDiv.removeEventListener('mousemove', onMouseMoveNative);
    };
  }, [map, dispatchAdd]);

  const handlePlaceSelect = useCallback(
    (location: { lat: number; lng: number; address: string }) => {
      setIsFollowing(false);
      map?.panTo({ lat: location.lat, lng: location.lng });
      map?.setZoom(18);
    },
    [map]
  );

  return (
    <div className="relative w-full h-full">
      <SearchBar onPlaceSelect={handlePlaceSelect} />
      <SyncIndicator isOnline={isOnline} isSyncing={isSyncing} pendingCount={pendingCount} />


      <Map
        mapId={MAP_ID}
        defaultCenter={userPosition ?? { lat: 35.68, lng: 139.76 }}
        defaultZoom={15}
        mapTypeId="hybrid"
        gestureHandling="greedy"
        disableDefaultUI={true}
        zoomControl={true}
        clickableIcons={true}
        onIdle={handleIdle}
        style={{ width: '100%', height: '100%' }}
      >
        {/* Visit markers (個別表示・ズームによってドット/フルピン切替) */}
        {showVisit && visibleProperties.map((p) => (
          <PropertyMarker key={p.id} property={p} isDot={isDot} showLabel={showLabel} onSelect={onSelectProperty} />
        ))}

        {/* 自社施工(緑)・ターゲット(橙)ピン */}
        {visibleLayerPins.map((p) => (
          <LayerMarker key={p.id} pin={p} onSelect={onSelectLayerPin} />
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

      {/* Layer toggle button */}
      <button
        onClick={() => setShowLayerPanel(!showLayerPanel)}
        className="absolute bottom-20 right-3 z-40 w-12 h-12 bg-white rounded-full shadow-lg flex items-center justify-center active:scale-95"
        title="レイヤー"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#666">
          <path d="M11.99 18.54l-7.37-5.73L3 14.07l9 7 9-7-1.63-1.27-7.38 5.74zM12 16l7.36-5.73L21 9l-9-7-9 7 1.63 1.27L12 16z" />
        </svg>
      </button>

      {/* Layer panel */}
      {showLayerPanel && (
        <div className="absolute bottom-34 right-3 z-40 bg-white rounded-xl shadow-lg p-3 w-56">
          <p className="text-xs font-bold text-gray-500 mb-2">レイヤー表示</p>
          <label className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={showVisit} onChange={(e) => setShowVisit(e.target.checked)} className="w-4 h-4 accent-blue-500" />
            <span className="text-sm font-bold" style={{ color: '#2196F3' }}>訪問ピン</span>
          </label>
          <label className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={showOurWork} onChange={(e) => setShowOurWork(e.target.checked)} className="w-4 h-4 accent-green-500" />
            <span className="text-sm font-bold" style={{ color: '#4CAF50' }}>🏠 自社施工</span>
          </label>
          <label className="flex items-center gap-2 py-1.5 cursor-pointer">
            <input type="checkbox" checked={showTarget} onChange={(e) => setShowTarget(e.target.checked)} className="w-4 h-4 accent-orange-500" />
            <span className="text-sm font-bold" style={{ color: '#FF5722' }}>🎯 ターゲット</span>
          </label>

          <div className="border-t mt-2 pt-2">
            <p className="text-xs font-bold text-gray-500 mb-1.5">長押しで追加</p>
            <div className="grid grid-cols-3 gap-1">
              <button
                onClick={() => setAddMode('visit')}
                className={`py-1.5 rounded-lg text-[10px] font-bold ${addMode === 'visit' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                訪問
              </button>
              <button
                onClick={() => setAddMode('our_work')}
                className={`py-1.5 rounded-lg text-[10px] font-bold ${addMode === 'our_work' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                🏠施工
              </button>
              <button
                onClick={() => setAddMode('target')}
                className={`py-1.5 rounded-lg text-[10px] font-bold ${addMode === 'target' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}
              >
                🎯標的
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active add mode badge */}
      {addMode !== 'visit' && (
        <div className="absolute top-16 left-3 z-40">
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold text-white shadow-lg ${addMode === 'our_work' ? 'bg-green-500' : 'bg-orange-500'}`}>
            {addMode === 'our_work' ? '🏠 自社施工モード' : '🎯 ターゲットモード'}
          </div>
        </div>
      )}

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
