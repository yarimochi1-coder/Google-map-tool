import { useState, useEffect } from 'react';
import { gasGet, gasPost } from '../lib/gasClient';

interface Inquiry {
  id: string;
  date: string;
  count: number;
  memo: string;
}

interface SettingsProps {
  userName: string;
  onChangeUserName: (name: string) => void;
  onClose: () => void;
}

const FLYERS_STORAGE_KEY = 'paint-map-flyers';
const ACTIVE_FLYER_KEY = 'paint-map-active-flyer'; // 旧（単一）互換用
const ACTIVE_FLYERS_KEY = 'paint-map-active-flyers'; // 新（複数）

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

// 配布中チラシ（複数）
export function getActiveFlyers(): string[] {
  try {
    const raw = localStorage.getItem(ACTIVE_FLYERS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  // 旧キーからフォールバック
  const single = localStorage.getItem(ACTIVE_FLYER_KEY);
  return single ? [single] : [];
}

export function setActiveFlyers(names: string[]) {
  localStorage.setItem(ACTIVE_FLYERS_KEY, JSON.stringify(names));
}

// 旧API互換（最初の1件を返す）
export function getActiveFlyer(): string {
  const list = getActiveFlyers();
  return list[0] ?? '';
}

export function Settings({ userName, onChangeUserName, onClose }: SettingsProps) {
  const [flyers, setFlyers] = useState<string[]>([]);
  const [activeFlyers, setActiveFlyersState] = useState<string[]>([]);
  const [newFlyer, setNewFlyer] = useState('');
  const [nameInput, setNameInput] = useState(userName);

  // 問い合わせ
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [inquiryDate, setInquiryDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [inquiryCount, setInquiryCount] = useState('1');
  const [inquiryMemo, setInquiryMemo] = useState('');
  const [loadingInquiry, setLoadingInquiry] = useState(false);

  const reloadInquiries = () => {
    gasGet<Inquiry[]>('inquiries').then((res) => {
      if (res.success && res.data) setInquiries(res.data);
    }).catch(() => {});
  };

  useEffect(() => {
    setFlyers(loadFlyers());
    setActiveFlyersState(getActiveFlyers());
    reloadInquiries();
  }, []);

  const addInquiry = async () => {
    const count = parseInt(inquiryCount);
    if (!inquiryDate || isNaN(count) || count <= 0) return;
    setLoadingInquiry(true);
    try {
      await gasPost({
        action: 'add_inquiry',
        data: { date: inquiryDate, count, memo: inquiryMemo },
      });
      setInquiryCount('1');
      setInquiryMemo('');
      reloadInquiries();
    } catch {
      alert('問い合わせの保存に失敗しました');
    } finally {
      setLoadingInquiry(false);
    }
  };

  const removeInquiry = async (id: string) => {
    if (!confirm('この問い合わせ記録を削除しますか？')) return;
    try {
      await gasPost({ action: 'delete_inquiry', data: { id } });
      reloadInquiries();
    } catch {
      alert('削除に失敗しました');
    }
  };

  const addFlyer = () => {
    const trimmed = newFlyer.trim();
    if (!trimmed || flyers.includes(trimmed)) return;
    const updated = [...flyers, trimmed];
    setFlyers(updated);
    saveFlyers(updated);
    // 1件目は自動で配布中に
    if (activeFlyers.length === 0) {
      const next = [trimmed];
      setActiveFlyersState(next);
      setActiveFlyers(next);
    }
    setNewFlyer('');
  };

  const removeFlyer = (name: string) => {
    const updated = flyers.filter((f) => f !== name);
    setFlyers(updated);
    saveFlyers(updated);
    if (activeFlyers.includes(name)) {
      const next = activeFlyers.filter((f) => f !== name);
      setActiveFlyersState(next);
      setActiveFlyers(next);
    }
  };

  const toggleActive = (name: string) => {
    const next = activeFlyers.includes(name)
      ? activeFlyers.filter((f) => f !== name)
      : [...activeFlyers, name];
    setActiveFlyersState(next);
    setActiveFlyers(next);
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
        {activeFlyers.length > 0 && (
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 mb-2">
            <p className="text-xs text-orange-700 mb-1">現在配布中のチラシ ({activeFlyers.length}枚)</p>
            <p className="text-sm font-bold text-orange-900">
              {activeFlyers.map((f) => `📄 ${f}`).join('   ')}
            </p>
          </div>
        )}

        {/* チラシリスト（複数チェック可） */}
        <div className="bg-white rounded-xl shadow-sm">
          {flyers.length === 0 ? (
            <p className="text-center text-gray-400 text-sm py-6">
              チラシを追加してください
            </p>
          ) : (
            <div className="divide-y">
              {flyers.map((name) => {
                const checked = activeFlyers.includes(name);
                return (
                <div key={name} className="flex items-center px-3 py-2.5 gap-2">
                  <button
                    onClick={() => toggleActive(name)}
                    className={`flex-1 text-left text-sm flex items-center gap-2 ${
                      checked ? 'font-bold text-orange-600' : 'text-gray-700'
                    }`}
                  >
                    <span className={`inline-flex items-center justify-center w-5 h-5 rounded border-2 ${
                      checked ? 'bg-orange-500 border-orange-500 text-white' : 'border-gray-300'
                    }`}>
                      {checked ? '✓' : ''}
                    </span>
                    {name}
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
                );
              })}
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
          ✓ が配布中のチラシ。新規ピン作成時に配布したものをチェックして記録します。
        </p>
      </div>

      {/* 問い合わせ管理 */}
      <div className="px-4 pt-4 pb-8">
        <h2 className="text-sm font-bold text-gray-700 mb-2">問い合わせ記録</h2>

        {/* 入力フォーム */}
        <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
          <div className="flex gap-2">
            <input
              type="date"
              value={inquiryDate}
              onChange={(e) => setInquiryDate(e.target.value)}
              className="flex-1 border rounded-lg px-2 py-2 text-sm"
            />
            <input
              type="number"
              min="1"
              value={inquiryCount}
              onChange={(e) => setInquiryCount(e.target.value)}
              className="w-20 border rounded-lg px-2 py-2 text-sm text-center"
              placeholder="件数"
            />
          </div>
          <input
            type="text"
            value={inquiryMemo}
            onChange={(e) => setInquiryMemo(e.target.value)}
            className="w-full border rounded-lg px-3 py-2 text-sm"
            placeholder="メモ（任意）"
          />
          <button
            onClick={addInquiry}
            disabled={loadingInquiry}
            className="w-full py-2 rounded-lg bg-pink-500 text-white text-sm font-bold disabled:bg-gray-300"
          >
            {loadingInquiry ? '保存中...' : '問い合わせを追加'}
          </button>
        </div>

        {/* 記録一覧 */}
        {inquiries.length > 0 && (
          <div className="mt-3 bg-white rounded-xl shadow-sm divide-y">
            {inquiries
              .slice()
              .sort((a, b) => String(b.date).localeCompare(String(a.date)))
              .slice(0, 30)
              .map((iq) => (
                <div key={iq.id} className="flex items-center px-3 py-2 gap-2">
                  <span className="text-xs text-gray-500 w-20">{String(iq.date)}</span>
                  <span className="flex-1 text-sm font-bold text-pink-600">{iq.count}件</span>
                  {iq.memo && <span className="text-xs text-gray-400 truncate flex-1">{iq.memo}</span>}
                  <button
                    onClick={() => removeInquiry(iq.id)}
                    className="text-red-400 text-xs px-2"
                  >
                    削除
                  </button>
                </div>
              ))}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-2">
          問い合わせがあった日と件数を記録します。分析タブで集計されます。
        </p>
      </div>
    </div>
  );
}
