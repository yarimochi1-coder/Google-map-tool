import { useState } from 'react';
import type { PropertyStatus } from '../types';
import { STATUS_LIST } from '../lib/statusConfig';
import { getActiveFlyers } from './Settings';

interface NewPinModalProps {
  lat: number;
  lng: number;
  defaultStaff?: string;
  onConfirm: (data: { name: string; status: PropertyStatus; staff: string; memo: string; flyerNames: string[] }) => void;
  onCancel: () => void;
}

export function NewPinModal({ lat, lng, defaultStaff, onConfirm, onCancel }: NewPinModalProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<PropertyStatus>('absent');
  const [staff] = useState(defaultStaff ?? '');
  const [memo, setMemo] = useState('');
  const activeFlyers = getActiveFlyers();
  // 初期は全て未チェック（実際に配ったものだけチェックする）
  const [selectedFlyers, setSelectedFlyers] = useState<string[]>([]);

  const toggleFlyer = (name: string) => {
    setSelectedFlyers((prev) =>
      prev.includes(name) ? prev.filter((f) => f !== name) : [...prev, name]
    );
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-end justify-center">
      <div className="bg-white rounded-t-2xl w-full max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="text-lg font-bold">新規ピン追加</h2>
          <button
            onClick={onCancel}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Location info */}
          <p className="text-xs text-gray-400">
            緯度: {lat.toFixed(6)}  経度: {lng.toFixed(6)}
          </p>

          {/* Name */}
          <div>
            <label className="text-sm font-bold text-gray-700">氏名</label>
            <input
              className="w-full border rounded-xl px-4 py-3 text-sm mt-1 focus:ring-2 focus:ring-blue-400 outline-none"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例: 田中太郎"
              autoFocus
            />
          </div>

          {/* Status */}
          <div>
            <label className="text-sm font-bold text-gray-700">ステータス</label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {STATUS_LIST.map((s) => {
                const isActive = status === s.key;
                return (
                  <button
                    key={s.key}
                    onClick={() => setStatus(s.key)}
                    className={`
                      flex items-center gap-1.5 px-2 py-2.5 rounded-xl text-xs font-bold
                      min-h-[44px] transition-all active:scale-95
                      ${isActive ? 'ring-2 ring-offset-1 shadow-md' : 'shadow-sm'}
                    `}
                    style={{
                      backgroundColor: isActive ? s.color : s.bgColor,
                      color: isActive ? '#fff' : s.color,
                    }}
                  >
                    <span>{s.icon}</span>
                    <span className="truncate">{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Memo */}
          <div>
            <label className="text-sm font-bold text-gray-700">メモ</label>
            <textarea
              className="w-full border rounded-xl px-4 py-3 text-sm mt-1 h-16 resize-none focus:ring-2 focus:ring-blue-400 outline-none"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="メモがあれば入力..."
            />
          </div>

          {/* チラシ配布（複数選択可） */}
          <div>
            <label className="text-sm font-bold text-gray-700">配布したチラシ</label>
            {activeFlyers.length === 0 ? (
              <p className="text-xs text-gray-400 mt-1 px-3 py-2 bg-gray-50 rounded-lg">
                設定画面でチラシを選択してください
              </p>
            ) : (
              <div className="mt-1 space-y-1">
                {activeFlyers.map((f) => {
                  const checked = selectedFlyers.includes(f);
                  return (
                    <button
                      key={f}
                      onClick={() => toggleFlyer(f)}
                      className={`w-full px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-all ${
                        checked
                          ? 'bg-purple-500 text-white font-bold'
                          : 'bg-purple-50 text-purple-600 border border-purple-300'
                      }`}
                    >
                      <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 ${
                        checked ? 'bg-white text-purple-600 border-white' : 'border-purple-300'
                      }`}>
                        {checked ? '✓' : ''}
                      </span>
                      📄 {f}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="flex gap-3 pb-2">
            <button
              onClick={onCancel}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-gray-100 text-gray-600 active:bg-gray-200"
            >
              キャンセル
            </button>
            <button
              onClick={() => onConfirm({ name, status, staff, memo, flyerNames: selectedFlyers })}
              className="flex-1 py-3 rounded-xl font-bold text-sm bg-blue-500 text-white active:bg-blue-600"
            >
              ピンを追加
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
