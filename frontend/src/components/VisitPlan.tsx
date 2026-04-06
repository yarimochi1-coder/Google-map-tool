import { useState, useMemo, useEffect } from 'react';
import type { Property, MonthlyGoal } from '../types';
import { getStatusConfig } from '../lib/statusConfig';

interface VisitPlanProps {
  properties: Property[];
  userPosition: { lat: number; lng: number } | null;
  onSelectProperty: (property: Property) => void;
  onClose: () => void;
}

const GOAL_STORAGE_KEY = 'paint-map-monthly-goal';

function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI/180) * Math.cos(lat2 * Math.PI/180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function daysSince(dateStr: string): number {
  if (!dateStr) return 999;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 999;
  return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

function getCurrentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function getWorkdaysLeft(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  let count = 0;
  for (let d = now.getDate(); d <= lastDay; d++) {
    const day = new Date(now.getFullYear(), now.getMonth(), d).getDay();
    if (day !== 0) count++; // 日曜以外を営業日
  }
  return count;
}

export function VisitPlan({ properties, userPosition, onSelectProperty, onClose }: VisitPlanProps) {
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [goalContracts, setGoalContracts] = useState('5');
  const currentMonth = getCurrentMonth();

  // Load saved goal
  useEffect(() => {
    const saved = localStorage.getItem(GOAL_STORAGE_KEY);
    if (saved) {
      try {
        const goal: MonthlyGoal = JSON.parse(saved);
        if (goal.month === currentMonth) {
          setGoalContracts(String(goal.targetContracts));
        }
      } catch { /* ignore */ }
    }
  }, [currentMonth]);

  const saveGoal = () => {
    const tc = parseInt(goalContracts) || 5;
    const goal: MonthlyGoal = {
      month: currentMonth,
      targetContracts: tc,
      targetAppointments: 0,
      targetVisits: 0,
    };
    localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(goal));
    setShowGoalEdit(false);
  };

  const plan = useMemo(() => {
    const targetContracts = parseInt(goalContracts) || 5;
    const month = currentMonth;

    // Current month stats
    const monthProperties = properties.filter((p) => {
      return p.last_visit_date && p.last_visit_date.includes(month.replace('-', '/').replace(/^(\d{4})\/0?/, '$1/'));
    });

    const currentContracts = properties.filter((p) =>
      (p.status === 'contract' || p.status === 'completed') &&
      p.updated_at && p.updated_at.startsWith(month)
    ).length;
    const currentAppos = properties.filter((p) =>
      p.status === 'appointment' &&
      p.updated_at && p.updated_at.startsWith(month)
    ).length;
    const currentVisits = monthProperties.length;

    // Calculate conversion rates from all data (or use defaults)
    const total = properties.length;
    const contractCount = properties.filter((p) => p.status === 'contract' || p.status === 'completed').length;
    const appoCount = properties.filter((p) => p.status === 'appointment').length;
    // Use actual rates if enough data, otherwise use defaults
    const appoToContract = appoCount > 5 ? contractCount / appoCount : 0.33;
    const visitToAppo = total > 20 ? (appoCount + contractCount) / total : 0.03;

    const neededContracts = Math.max(targetContracts - currentContracts, 0);
    const neededAppos = Math.ceil(neededContracts / appoToContract);
    const neededVisits = Math.ceil(neededAppos / (visitToAppo > 0 ? visitToAppo : 0.03));

    const workdaysLeft = getWorkdaysLeft();
    const visitsPerDay = workdaysLeft > 0 ? Math.ceil(neededVisits / workdaysLeft) : 0;

    // Build today's visit list
    // Priority 1: Revisit flagged properties (sorted by distance)
    const revisitList = properties
      .filter((p) => p.revisit && p.status !== 'contract' && p.status !== 'completed' && p.status !== 'impossible')
      .map((p) => ({
        ...p,
        priority: 1,
        reason: getRevisitReason(p),
        distance: userPosition ? getDistance(userPosition.lat, userPosition.lng, p.lat, p.lng) : 0,
      }));

    // Sort by distance for efficient routing
    revisitList.sort((a, b) => a.distance - b.distance);

    // Priority 2: Hot leads (measured, talked) that aren't flagged for revisit
    const hotLeads = properties
      .filter((p) =>
        !p.revisit &&
        (p.status === 'measured' || p.status === 'ng')
      )
      .map((p) => ({
        ...p,
        priority: 2,
        reason: p.status === 'measured' ? 'アポ取り推奨' : '話し込み済み・フォロー推奨',
        distance: userPosition ? getDistance(userPosition.lat, userPosition.lng, p.lat, p.lng) : 0,
      }));
    hotLeads.sort((a, b) => a.distance - b.distance);

    const todayList = [...revisitList, ...hotLeads];

    return {
      targetContracts,
      currentContracts,
      currentAppos,
      currentVisits,
      neededContracts,
      neededAppos,
      neededVisits,
      visitsPerDay,
      workdaysLeft,
      appoToContract: Math.round(appoToContract * 100),
      visitToAppo: Math.round(visitToAppo * 100),
      todayList,
      revisitCount: revisitList.length,
      hotLeadCount: hotLeads.length,
      hasEnoughData: total > 20,
    };
  }, [properties, userPosition, goalContracts, currentMonth]);

  function getRevisitReason(p: Property): string {
    const days = daysSince(p.last_visit_date);
    const statusCfg = getStatusConfig(p.status);
    if (days < 999) {
      return `${statusCfg.label}・${days}日前`;
    }
    return statusCfg.label;
  }

  const handleStartRoute = () => {
    const routeProperties = plan.todayList.slice(0, 10).map((p) => {
      const { priority, reason, distance, ...prop } = p;
      return prop as Property;
    });
    if (routeProperties.length > 0 && userPosition) {
      // Open Google Maps with waypoints
      const waypoints = routeProperties.map((p) => `${p.lat},${p.lng}`).join('/');
      const url = `https://www.google.com/maps/dir/${userPosition.lat},${userPosition.lng}/${waypoints}`;
      window.open(url, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-50 z-50 overflow-y-auto">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">訪問プラン</h1>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl">×</button>
        </div>
      </div>

      {/* Monthly Goal */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-700">月間目標（{currentMonth.replace('-', '年')}月）</h2>
            <button
              onClick={() => setShowGoalEdit(!showGoalEdit)}
              className="text-xs text-blue-500 font-bold"
            >
              {showGoalEdit ? '閉じる' : '設定'}
            </button>
          </div>

          {showGoalEdit && (
            <div className="flex gap-2 mb-3">
              <div className="flex-1">
                <label className="text-[10px] text-gray-400">成約目標</label>
                <input
                  type="number"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={goalContracts}
                  onChange={(e) => setGoalContracts(e.target.value)}
                />
              </div>
              <button onClick={saveGoal} className="self-end px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold">保存</button>
            </div>
          )}

          {/* Progress */}
          <div className="grid grid-cols-3 gap-2 mb-3">
            <div className="text-center">
              <p className="text-[10px] text-gray-400">成約</p>
              <p className="text-xl font-black">
                <span className={plan.currentContracts >= plan.targetContracts ? 'text-green-600' : 'text-gray-800'}>
                  {plan.currentContracts}
                </span>
                <span className="text-xs text-gray-400">/{plan.targetContracts}</span>
              </p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-400">アポ</p>
              <p className="text-xl font-black text-blue-600">{plan.currentAppos}</p>
            </div>
            <div className="text-center">
              <p className="text-[10px] text-gray-400">訪問</p>
              <p className="text-xl font-black text-gray-600">{plan.currentVisits}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${Math.min((plan.currentContracts / plan.targetContracts) * 100, 100)}%` }}
            />
          </div>

          {/* KPI逆算 */}
          <div className="bg-gray-50 rounded-lg p-3 space-y-1">
            <p className="text-xs font-bold text-gray-600">目標達成に必要な行動量</p>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">残り必要成約</span>
              <span className="font-bold">{plan.neededContracts}件</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">必要アポ数（転換率{plan.appoToContract}%）</span>
              <span className="font-bold">{plan.neededAppos}件</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-gray-500">必要訪問数（アポ率{plan.visitToAppo}%）</span>
              <span className="font-bold">{plan.neededVisits}件</span>
            </div>
            <div className="flex justify-between text-xs border-t pt-1 mt-1">
              <span className="text-gray-500">残り営業日</span>
              <span className="font-bold">{plan.workdaysLeft}日</span>
            </div>
            <div className="flex justify-between text-sm border-t pt-1 mt-1">
              <span className="font-bold text-blue-600">1日あたり目標訪問数</span>
              <span className="font-black text-blue-600 text-lg">{plan.visitsPerDay}件</span>
            </div>
            {!plan.hasEnoughData && (
              <p className="text-[10px] text-orange-500 mt-1">※ データ不足のため参考値です。データが20件以上になると実績ベースの数値になります。</p>
            )}
          </div>
        </div>
      </div>

      {/* Today's Visit Plan */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-700">
            今日の訪問リスト
            <span className="text-xs font-normal text-gray-400 ml-2">
              再訪問{plan.revisitCount}件 + ホット{plan.hotLeadCount}件
            </span>
          </h2>
        </div>

        {plan.todayList.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 text-sm">
            再訪問フラグが立っているピンがありません。<br />
            ピンの詳細画面で「再訪問」ボタンを押すと<br />
            ここにリストが表示されます。
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {plan.todayList.map((p, i) => {
                const cfg = getStatusConfig(p.status);
                const distKm = p.distance > 0 ? (p.distance / 1000).toFixed(1) : null;
                return (
                  <div
                    key={p.id}
                    onClick={() => onSelectProperty(p as Property)}
                    className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3 active:bg-gray-50 cursor-pointer"
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0"
                      style={{ backgroundColor: p.priority === 1 ? '#FF9800' : '#2196F3' }}
                    >
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{p.name || '名称未設定'}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full text-white font-bold" style={{ backgroundColor: cfg.color }}>
                          {cfg.icon} {cfg.label}
                        </span>
                        <span className="text-[10px] text-gray-400">{p.reason}</span>
                      </div>
                    </div>
                    {distKm && (
                      <span className="text-xs text-gray-400 shrink-0">{distKm}km</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Route button */}
            <button
              onClick={handleStartRoute}
              className="w-full mt-3 py-4 bg-green-500 text-white rounded-xl font-bold text-sm active:bg-green-600 flex items-center justify-center gap-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.71 11.29l-9-9a.996.996 0 00-1.41 0l-9 9a.996.996 0 000 1.41l9 9c.39.39 1.02.39 1.41 0l9-9a.996.996 0 000-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z" />
              </svg>
              Googleマップでルート案内（上位{Math.min(plan.todayList.length, 10)}件）
            </button>
          </>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}
