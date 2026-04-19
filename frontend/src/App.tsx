import { useState, useCallback } from 'react';
import type { Property, PropertyStatus, LayerPin, MarkerLayer } from './types';
import { MapView } from './components/MapView';
import { PropertyDetail } from './components/PropertyDetail';
import { Dashboard } from './components/Dashboard';
import { ImportModal } from './components/ImportModal';
import { NewPinModal } from './components/NewPinModal';
import { useProperties } from './hooks/useProperties';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { Analytics } from './components/Analytics';
import { VisitPlan } from './components/VisitPlan';
import { useUserName } from './hooks/useUserName';
import { useGeolocation } from './hooks/useGeolocation';
import { useLayerPins } from './hooks/useLayerPins';
import { LayerPinDetail } from './components/LayerPinDetail';
import { NameInputModal } from './components/NameInputModal';
import { Settings } from './components/Settings';

type View = 'map' | 'dashboard' | 'analytics' | 'plan' | 'settings';

export default function App() {
  const [view, setView] = useState<View>('map');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [newPinLocation, setNewPinLocation] = useState<{ lat: number; lng: number } | null>(null);
  const isOnline = useOnlineStatus();
  const { userName, setUserName } = useUserName();
  const { position: userPosition } = useGeolocation();
  const { pins: layerPins, addPin: addLayerPin, removePin: removeLayerPin, updatePin: updateLayerPin, importPins: importLayerPins } = useLayerPins();
  const [selectedLayerPin, setSelectedLayerPin] = useState<LayerPin | null>(null);

  const handleAddLayerPin = useCallback((lat: number, lng: number, layer: MarkerLayer) => {
    addLayerPin({ lat, lng, name: '', address: '', memo: '', layer });
  }, [addLayerPin]);

  const {
    properties,
    addProperty,
    updateProperty,
    updateStatus,
    incrementVisit,
    importProperties,
    isSyncing,
    pendingCount,
    removeProperty,
  } = useProperties();

  // Long press opens the new pin modal instead of immediately adding
  const handleLongPress = useCallback(
    (lat: number, lng: number) => {
      setNewPinLocation({ lat, lng });
    },
    []
  );

  const handleConfirmNewPin = useCallback(
    async (data: { name: string; status: PropertyStatus; staff: string; memo: string; flyerDistributed?: boolean; flyerName?: string }) => {
      if (!newPinLocation) return;
      const now = new Date().toLocaleString('ja-JP');
      await addProperty({
        lat: newPinLocation.lat,
        lng: newPinLocation.lng,
        address: '',
        name: data.name,
        status: data.status,
        building_age: '',
        deterioration: '',
        photo_url: '',
        memo: data.memo,
        staff: data.staff,
        roof_type: '',
        estimated_area: '',
        contract_amount: '',
        rejection_reason: '',
        revisit: '',
        last_visit_date: now,
        user_id: '',
        flyer_distributed: data.flyerDistributed ? now : '',
        flyer_name: data.flyerDistributed ? (data.flyerName || '') : '',
      });
      setNewPinLocation(null);
      setSelectedProperty(null);
    },
    [newPinLocation, addProperty]
  );

  const handleSelectProperty = useCallback((p: Property) => {
    setSelectedProperty(p);
  }, []);

  // Keep selected property in sync with properties array
  const currentSelected = selectedProperty
    ? properties.find((p) => p.id === selectedProperty.id) ?? selectedProperty
    : null;

  // 名前未入力なら入力モーダルを表示
  if (!userName) {
    return <NameInputModal onSubmit={setUserName} />;
  }

  return (
    <div className="h-dvh w-full flex flex-col overflow-hidden bg-gray-100">
      {/* Main content */}
      <div className="flex-1 relative">
        {view === 'map' ? (
          <MapView
            properties={properties}
            layerPins={layerPins}
            isOnline={isOnline}
            isSyncing={isSyncing}
            pendingCount={pendingCount}
            onSelectProperty={handleSelectProperty}
            onAddPin={handleLongPress}
            onAddLayerPin={handleAddLayerPin}
            onSelectLayerPin={setSelectedLayerPin}
          />
        ) : view === 'dashboard' ? (
          <Dashboard
            properties={properties}
            userName={userName}
            onClose={() => setView('map')}
          />
        ) : view === 'analytics' ? (
          <Analytics
            properties={properties}
            onClose={() => setView('map')}
          />
        ) : view === 'plan' ? (
          <VisitPlan
            properties={properties}
            userPosition={userPosition}
            onSelectProperty={(p) => { setSelectedProperty(p); setView('map'); }}
            onClose={() => setView('map')}
          />
        ) : (
          <Settings
            userName={userName}
            onChangeUserName={setUserName}
            onClose={() => setView('map')}
          />
        )}
      </div>

      {/* Layer pin detail */}
      {selectedLayerPin && view === 'map' && (
        <LayerPinDetail
          pin={selectedLayerPin}
          onUpdate={updateLayerPin}
          onDelete={(id) => { removeLayerPin(id); setSelectedLayerPin(null); }}
          onClose={() => setSelectedLayerPin(null)}
        />
      )}

      {/* Property detail panel */}
      {currentSelected && view === 'map' && !newPinLocation && !selectedLayerPin && (
        <PropertyDetail
          property={currentSelected}
          onUpdateStatus={updateStatus}
          onUpdate={updateProperty}
          onIncrementVisit={incrementVisit}
          onDelete={(id) => { removeProperty(id); setSelectedProperty(null); }}
          onClose={() => setSelectedProperty(null)}
        />
      )}

      {/* New pin modal */}
      {newPinLocation && (
        <NewPinModal
          lat={newPinLocation.lat}
          lng={newPinLocation.lng}
          defaultStaff={userName}
          onConfirm={(data) => {
            if (data.staff && data.staff !== userName) setUserName(data.staff);
            handleConfirmNewPin(data);
          }}
          onCancel={() => setNewPinLocation(null)}
        />
      )}

      {/* Import modal */}
      {showImport && (
        <ImportModal
          onImport={importProperties}
          onImportLayer={importLayerPins}
          onClose={() => setShowImport(false)}
        />
      )}

      {/* Bottom navigation - always visible */}
      {!currentSelected && !newPinLocation && !showImport && !selectedLayerPin && (
        <div className="bg-white border-t border-gray-200 flex safe-bottom z-50 relative">
          <button
            onClick={() => setView('map')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 ${
              view === 'map' ? 'text-blue-500' : 'text-gray-400'
            }`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            <span className="text-[10px] font-bold">マップ</span>
          </button>
          <button
            onClick={() => setShowImport(true)}
            className="flex-1 py-3 flex flex-col items-center gap-0.5 text-gray-400"
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z" />
            </svg>
            <span className="text-[10px] font-bold">インポート</span>
          </button>
          <button
            onClick={() => setView('dashboard')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 ${view === 'dashboard' ? 'text-blue-500' : 'text-gray-400'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zM9 17H7v-7h2v7zm4 0h-2V7h2v10zm4 0h-2v-4h2v4z" />
            </svg>
            <span className="text-[10px] font-bold">集計</span>
          </button>
          <button
            onClick={() => setView('plan')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 ${view === 'plan' ? 'text-blue-500' : 'text-gray-400'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M14 6l-1-2H5v17h2v-7h5l1 2h7V6h-6zm4 8h-4l-1-2H7V6h5l1 2h5v6z" />
            </svg>
            <span className="text-[10px] font-bold">プラン</span>
          </button>
          <button
            onClick={() => setView('analytics')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 ${view === 'analytics' ? 'text-blue-500' : 'text-gray-400'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z" />
            </svg>
            <span className="text-[10px] font-bold">分析</span>
          </button>
          <button
            onClick={() => setView('settings')}
            className={`flex-1 py-3 flex flex-col items-center gap-0.5 ${view === 'settings' ? 'text-blue-500' : 'text-gray-400'}`}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.488.488 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94 0 .31.02.64.07.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" />
            </svg>
            <span className="text-[10px] font-bold">設定</span>
          </button>
        </div>
      )}
    </div>
  );
}
