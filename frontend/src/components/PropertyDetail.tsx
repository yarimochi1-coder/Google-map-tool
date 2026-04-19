import { useState, useEffect } from 'react';
import type { Property, PropertyStatus } from '../types';
import { StatusSelector } from './StatusSelector';
import { getStatusConfig } from '../lib/statusConfig';
import { gasGet } from '../lib/gasClient';
import { getActiveFlyer } from './Settings';

interface VisitRecord {
  status: string;
  staff: string;
  visited_at: string;
  memo: string;
}

interface PropertyDetailProps {
  property: Property;
  onUpdateStatus: (id: string, status: PropertyStatus) => void;
  onUpdate: (id: string, changes: Partial<Property>) => void;
  onIncrementVisit: (id: string) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export function PropertyDetail({
  property,
  onUpdateStatus,
  onUpdate,
  onIncrementVisit,
  onDelete,
  onClose,
}: PropertyDetailProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [history, setHistory] = useState<VisitRecord[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showRevisitPicker, setShowRevisitPicker] = useState(false);
  const [revisitDate, setRevisitDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });

  // 訪問履歴を取得
  useEffect(() => {
    if (property.id) {
      gasGet<VisitRecord[]>('history', { property_id: property.id }).then((res) => {
        if (res.success && res.data) {
          // 新しい順にソート
          const sorted = res.data.sort((a, b) =>
            String(b.visited_at).localeCompare(String(a.visited_at))
          );
          setHistory(sorted);
        }
      }).catch(() => {});
    }
  }, [property.id, property.visit_count]);
  const [name, setName] = useState(property.name);
  const [memo, setMemo] = useState(property.memo);
  const [buildingAge, setBuildingAge] = useState(property.building_age);
  const [deterioration, setDeterioration] = useState(property.deterioration);
  const [roofType, setRoofType] = useState(property.roof_type);
  const [estimatedArea, setEstimatedArea] = useState(property.estimated_area);
  const [contractAmount, setContractAmount] = useState(property.contract_amount);
  const [rejectionReason, setRejectionReason] = useState(property.rejection_reason);

  useEffect(() => {
    setName(property.name);
    setMemo(property.memo);
    setBuildingAge(property.building_age);
    setDeterioration(property.deterioration);
    setRoofType(property.roof_type ?? '');
    setEstimatedArea(property.estimated_area ?? '');
    setContractAmount(property.contract_amount ?? '');
    setRejectionReason(property.rejection_reason ?? '');
    setIsEditing(false);
  }, [property]);

  const handleSave = () => {
    onUpdate(property.id, {
      name,
      memo,
      building_age: buildingAge,
      deterioration,
      roof_type: roofType,
      estimated_area: estimatedArea,
      contract_amount: contractAmount,
      rejection_reason: rejectionReason,
    });
    setIsEditing(false);
  };

  function formatRevisitDate(dateStr: string): string {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '';
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];
    const dateOnly = d.toISOString().split('T')[0];
    if (dateOnly === todayStr) return '今日';
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (dateOnly === tomorrow.toISOString().split('T')[0]) return '明日';
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  const statusConfig = getStatusConfig(property.status);

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl z-50 max-h-[80vh] overflow-y-auto pb-safe">
      <div className="flex justify-center pt-2 pb-1">
        <div className="w-10 h-1 bg-gray-300 rounded-full" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: statusConfig.color }}
            >
              {statusConfig.icon} {statusConfig.label}
            </span>
            <span className="text-xs text-gray-400">
              訪問{property.visit_count}回
            </span>
          </div>
          {!isEditing ? (
            <h2 className="text-lg font-bold truncate mt-1">
              {property.name || property.address || '名称未設定'}
            </h2>
          ) : (
            <input
              className="text-lg font-bold w-full border-b border-blue-400 outline-none mt-1 bg-transparent"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="氏名"
            />
          )}
          <p className="text-xs text-gray-500 truncate">{property.address}</p>
        </div>
        <button
          onClick={onClose}
          className="ml-2 w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl shrink-0"
        >
          ×
        </button>
      </div>

      {/* Status selector */}
      <StatusSelector
        currentStatus={property.status}
        onSelect={(status) => onUpdateStatus(property.id, status)}
      />

      {/* チラシ配布ボタン */}
      <div className="px-4 py-2">
        <button
          onClick={() => {
            if (property.flyer_distributed) {
              // 解除
              if (confirm(`「${property.flyer_name || 'チラシ'}」配布記録を解除しますか？`)) {
                onUpdate(property.id, { flyer_distributed: '', flyer_name: '' });
              }
            } else {
              const active = getActiveFlyer();
              if (!active) {
                alert('設定画面で配布するチラシを選択してください');
                return;
              }
              onUpdate(property.id, {
                flyer_distributed: new Date().toLocaleString('ja-JP'),
                flyer_name: active,
              });
            }
          }}
          className={`w-full py-2.5 rounded-xl font-bold text-sm ${
            property.flyer_distributed
              ? 'bg-purple-500 text-white active:bg-purple-600'
              : 'bg-purple-50 text-purple-600 border border-purple-300 active:bg-purple-100'
          }`}
        >
          {property.flyer_distributed
            ? `📄 配布済: ${property.flyer_name || '(名称なし)'}`
            : '📄 チラシ配布'}
        </button>
      </div>

      {/* Actions */}
      <div className="flex gap-2 px-4 py-2">
        <button
          onClick={() => onIncrementVisit(property.id)}
          className="flex-1 bg-blue-500 text-white py-3 rounded-xl font-bold text-sm active:bg-blue-600"
        >
          +1 訪問記録
        </button>
        <button
          onClick={() => {
            if (property.revisit) {
              // 解除
              onUpdate(property.id, { revisit: '' });
            } else {
              // 日付選択
              setShowRevisitPicker(true);
            }
          }}
          className={`py-3 px-4 rounded-xl font-bold text-sm ${
            property.revisit
              ? 'bg-orange-500 text-white active:bg-orange-600'
              : 'bg-orange-50 text-orange-500 border border-orange-300 active:bg-orange-100'
          }`}
        >
          {property.revisit ? `再訪問 ${formatRevisitDate(property.revisit)}` : '再訪問'}
        </button>
        <button
          onClick={() => (isEditing ? handleSave() : setIsEditing(true))}
          className={`flex-1 py-3 rounded-xl font-bold text-sm ${
            isEditing
              ? 'bg-green-500 text-white active:bg-green-600'
              : 'bg-gray-100 text-gray-700 active:bg-gray-200'
          }`}
        >
          {isEditing ? '保存' : '編集'}
        </button>
      </div>

      {/* Revisit date picker */}
      {showRevisitPicker && (
        <div className="px-4 py-2">
          <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
            <p className="text-xs font-bold text-orange-700 mb-2">再訪問日を設定</p>
            <div className="flex gap-2 mb-2">
              {[
                { label: '今日', days: 0 },
                { label: '明日', days: 1 },
                { label: '3日後', days: 3 },
                { label: '1週間後', days: 7 },
              ].map((opt) => {
                const d = new Date();
                d.setDate(d.getDate() + opt.days);
                const val = d.toISOString().split('T')[0];
                return (
                  <button
                    key={opt.label}
                    onClick={() => setRevisitDate(val)}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                      revisitDate === val ? 'bg-orange-500 text-white' : 'bg-white text-orange-500 border border-orange-300'
                    }`}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <input
              type="date"
              value={revisitDate}
              onChange={(e) => setRevisitDate(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
            />
            <div className="flex gap-2">
              <button
                onClick={() => setShowRevisitPicker(false)}
                className="flex-1 py-2 rounded-lg text-sm font-bold bg-gray-100 text-gray-500"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  onUpdate(property.id, { revisit: revisitDate + 'T00:00:00' });
                  setShowRevisitPicker(false);
                }}
                className="flex-1 py-2 rounded-lg text-sm font-bold bg-orange-500 text-white"
              >
                設定
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit fields */}
      {isEditing && (
        <div className="px-4 pb-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500">築年数</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={buildingAge} onChange={(e) => setBuildingAge(e.target.value)} placeholder="例: 築20年" />
          </div>
          <div>
            <label className="text-xs text-gray-500">劣化状況</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={deterioration} onChange={(e) => setDeterioration(e.target.value)} placeholder="例: チョーキングあり" />
          </div>
          <div>
            <label className="text-xs text-gray-500">屋根の種類</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={roofType} onChange={(e) => setRoofType(e.target.value)}>
              <option value="">未設定</option>
              <option value="スレート">スレート</option>
              <option value="瓦">瓦</option>
              <option value="金属">金属</option>
              <option value="トタン">トタン</option>
              <option value="アスファルトシングル">アスファルトシングル</option>
              <option value="その他">その他</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">概算面積（㎡）</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={estimatedArea} onChange={(e) => setEstimatedArea(e.target.value)} placeholder="例: 120" />
          </div>
          <div>
            <label className="text-xs text-gray-500">成約金額</label>
            <input className="w-full border rounded-lg px-3 py-2 text-sm" value={contractAmount} onChange={(e) => setContractAmount(e.target.value)} placeholder="例: 1200000" />
          </div>
          <div>
            <label className="text-xs text-gray-500">断り理由</label>
            <select className="w-full border rounded-lg px-3 py-2 text-sm" value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)}>
              <option value="">なし</option>
              <option value="金額">金額が高い</option>
              <option value="時期">今じゃない</option>
              <option value="他社">他社で決まっている</option>
              <option value="不要">必要ない</option>
              <option value="賃貸">賃貸</option>
              <option value="その他">その他</option>
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500">メモ</label>
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm h-20 resize-none" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="メモを入力..." />
          </div>
        </div>
      )}

      {/* Info display */}
      {!isEditing && (
        <div className="px-4 pb-2 space-y-1 text-sm text-gray-600">
          {property.building_age && <p>築年数: {property.building_age}</p>}
          {property.deterioration && <p>劣化: {property.deterioration}</p>}
          {property.roof_type && <p>屋根: {property.roof_type}</p>}
          {property.estimated_area && <p>面積: {property.estimated_area}㎡</p>}
          {property.contract_amount && <p>金額: ¥{Number(property.contract_amount).toLocaleString()}</p>}
          {property.rejection_reason && <p>断り理由: {property.rejection_reason}</p>}
          {property.memo && <p>メモ: {property.memo}</p>}
        </div>
      )}

      {(property.last_visit_date || property.staff) && (
        <div className="px-4 pb-2 text-xs text-gray-400 flex gap-3">
          {property.last_visit_date && <span>最終訪問: {property.last_visit_date}</span>}
          {property.staff && <span>担当: {property.staff}</span>}
        </div>
      )}

      {/* Visit history */}
      {history.length > 0 && (
        <div className="px-4 pb-3">
          <button
            onClick={() => setShowHistory((v) => !v)}
            className="w-full flex items-center justify-between py-2 text-sm font-bold text-gray-700"
          >
            <span>訪問履歴（{history.length}件）</span>
            <span className="text-gray-400">{showHistory ? '▲' : '▼'}</span>
          </button>
          {showHistory && (
            <div className="bg-gray-50 rounded-xl divide-y divide-gray-200 overflow-hidden">
              {history.map((h, i) => {
                const cfg = getStatusConfig(h.status as PropertyStatus);
                return (
                  <div key={i} className="px-3 py-2">
                    <div className="flex items-center justify-between">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold text-white"
                        style={{ backgroundColor: cfg.color }}
                      >
                        {cfg.icon} {cfg.label}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {String(h.visited_at).replace('T', ' ').substring(0, 19)}
                      </span>
                    </div>
                    <div className="flex gap-2 mt-0.5 text-[10px] text-gray-400">
                      {h.staff && <span>担当: {h.staff}</span>}
                      {h.memo && <span className="text-orange-500">{h.memo}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete */}
      <div className="px-4 pb-4">
        <button
          onClick={() => { if (confirm('このピンを削除しますか？')) onDelete(property.id); }}
          className="w-full py-2 text-red-500 text-sm font-bold rounded-xl border border-red-200 active:bg-red-50"
        >
          ピンを削除
        </button>
      </div>
    </div>
  );
}
