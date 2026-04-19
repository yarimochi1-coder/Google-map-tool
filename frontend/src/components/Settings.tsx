import { useState, useEffect } from 'react';

interface SettingsProps {
  userName: string;
  onChangeUserName: (name: string) => void;
  onClose: () => void;
}

const FLYERS_STORAGE_KEY = 'paint-map-flyers';
const ACTIVE_FLYER_KEY = 'paint-map-active-flyer';

export function loadFlyers(): string[] {
  try {
    const raw = localStorage.getItem(FLYERS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveFlyers(flyers: string[]) {
  localStorage.setItem(FLYERS_STORAGE_KEY, JSON.stringify(flyers));
}

export function getActiveFlyer(): string {
  return localStorage.getItem(ACTIVE_FLYER_KEY) ?? '';
}

export function setActiveFlyer(name: string) {
  localStorage.setItem(ACTIVE_FLYER_KEY, name);
}

export function Settings({ userName, onChangeUserName, onClose }: SettingsProps) {
  const [flyers, setFlyers] = useState<string[]>([]);
  const [activeFlyer, setActiveFlyerState] = useState<string>('');
  const [newFlyer, setNewFlyer] = useState('');
  const [nameInput, setNameInput] = useState(userName);

  useEffect(() => {
    setFlyers(loadFlyers());
    setActiveFlyerState(getActiveFlyer());
  }, []);

  const addFlyer = () => {
    const trimmed = newFlyer.trim();
    if (!trimmed || flyers.includes(trimmed)) return;
    const updated = [...flyers, trimmed];
    setFlyers(updated);
    saveFlyers(updated);
    if (!activeFlyer) {
      setActiveFlyerState(trimmed);
      setActiveFlyer(trimmed);
    }
    setNewFlyer('');
  };

  const removeFlyer = (name: string) => {
    const updated = flyers.filter((f) => f !== name);
    setFlyers(updated);
    saveFlyers(updated);
    if (activeFlyer === name) {
      const nextActive = updated[0] ?? '';
      setActiveFlyerState(nextActive);
      setActiveFlyer(nextActive);
    }
  };

  const selectActive = (name: string) => {
    setActiveFlyerState(name);
    setActiveFlyer(name);
  };

  const saveName = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== userName) onChangeUserName(trimmed);
  };

  return (
    <div className="absolute inset-0 bg-gray-50 overflow-y-auto pb-20">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">設定</h1>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl">×</button>
        </div>
      </div>

      {/* 担当者名 */}
      <div className="px-4 pt-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">担当者名</h2>
        <div className="bg-white rounded-xl shadow-sm p-3 flex gap-2">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="担当者名"
          />
          <button
            onClick={saveName}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-bold"
          >
            保存
          </button>
        </div>
      </div>

      {/* チラシ管理 */}
      <div className="px-4 pt-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">チラシ管理</h2>

        {/* 現在のチラシ */}
        {activeFlyer && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-2">
            <p className="text-xs text-orange-700 mb-1">現在配布中のチラシ</p>
            <p className="text-base font-bold text-orange-900">📄 {activeFlyer}</p>
          </div>
        )}

        {/* チラシリスト */}
        <div className="bg-white rounded-xl shadow-sm">
          {flyers.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">
              チラシを追加してください
            </p>
          ) : (
            <div className="divide-y">
              {flyers.map((name) => (
                <div key={name} className="flex items-center px-3 py-2.5 gap-2">
                  <button
                    onClick={() => selectActive(name)}
                    className={`flex-1 text-left text-sm ${
                      activeFlyer === name ? 'font-bold text-orange-600' : 'text-gray-700'
                    }`}
                  >
                    {activeFlyer === name ? '● ' : '○ '}{name}
                  </button>
                  <button
                    onClick={() => {
                      if (confirm(`「${name}」を削除しますか？`)) removeFlyer(name);
                    }}
                    className="text-red-400 text-xs px-2 py-1"
                  >
                    削除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 追加 */}
        <div className="mt-2 flex gap-2">
          <input
            type="text"
            value={newFlyer}
            onChange={(e) => setNewFlyer(e.target.value)}
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
            placeholder="例: 春のキャンペーンチラシ"
            onKeyDown={(e) => { if (e.key === 'Enter') addFlyer(); }}
          />
          <button
            onClick={addFlyer}
            disabled={!newFlyer.trim()}
            className="px-4 py-2 rounded-lg bg-orange-500 text-white text-sm font-bold disabled:bg-gray-300"
          >
            追加
          </button>
        </div>

        <p className="text-xs text-gray-400 mt-2">
          ● が現在選択中のチラシ。ピンに「チラシ配布」ボタンを押すとこの名前で記録されます。
        </p>
      </div>
    </div>
  );
}
