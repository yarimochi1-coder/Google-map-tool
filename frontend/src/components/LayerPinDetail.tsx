import { useState, useEffect } from 'react';
import type { LayerPin } from '../types';

interface LayerPinDetailProps {
  pin: LayerPin;
  onUpdate: (id: string, changes: Partial<LayerPin>) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function LayerPinDetail({ pin, onUpdate, onDelete, onClose }: LayerPinDetailProps) {
  const [name, setName] = useState(pin.name);
  const [memo, setMemo] = useState(pin.memo);
  const [isEditing, setIsEditing] = useState(false);

  useEffect(() => {
    setName(pin.name);
    setMemo(pin.memo);
    setIsEditing(false);
  }, [pin]);

  const isOurWork = pin.layer === 'our_work';
  const color = isOurWork ? '#4CAF50' : '#FF5722';
  const label = isOurWork ? '🏠 自社施工' : '🎯 ターゲット';

  const handleSave = () => {
    onUpdate(pin.id, { name, memo });
    setIsEditing(false);
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 max-h-[80vh] overflow-y-auto">
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      <div className="flex items-center justify-between px-4 pb-2">
        <div className="flex-1 min-w-0">
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white" style={{ backgroundColor: color }}>
            {label}
          </span>
          {!isEditing ? (
            <h2 className="text-lg font-bold truncate mt-1">{pin.name || '名称未設定'}</h2>
          ) : (
            <input
              className="text-lg font-bold w-full border-b border-blue-400 outline-none mt-1 bg-transparent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="名前"
            />
          )}
          {pin.address && <p className="text-xs text-gray-500 truncate">{pin.address}</p>}
        </div>
        <button onClick={onClose} className="ml-2 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl shrink-0">×</button>
      </div>

      <div className="flex gap-2 px-4 py-2">
        <button
          onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
          className={`flex-1 py-3 rounded-xl font-bold text-sm ${
            isEditing ? 'bg-green-500 text-white active:bg-green-600' : 'bg-gray-100 text-gray-700 active:bg-gray-200'
          }`}
        >
          {isEditing ? '保存' : '編集'}
        </button>
      </div>

      {isEditing && (
        <div className="px-4 pb-4">
          <label className="text-xs text-gray-500">メモ</label>
          <textarea
            className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none"
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="メモを入力..."
          />
        </div>
      )}

      {!isEditing && pin.memo && (
        <div className="px-4 pb-2 text-sm text-gray-600">{pin.memo}</div>
      )}

      <div className="px-4 pb-4 text-xs text-gray-400">
        緯度: {pin.lat.toFixed(6)} / 経度: {pin.lng.toFixed(6)}
      </div>

      <div className="px-4 pb-4">
        <button
          onClick={() => { if (confirm('このピンを削除しますか？')) onDelete(pin.id); }}
          className="w-full py-2 text-red-500 text-sm font-bold rounded-xl border border-red-200 active:bg-red-50"
        >
          ピンを削除
        </button>
      </div>
    </div>
  );
}
