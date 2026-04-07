import { useState, useMemo, useEffect } from 'react';
import type { Property } from '../types';
import { getStatusConfig } from '../lib/statusConfig';

interface VisitPlanProps {
  properties: Property[];
  userPosition: { lat: number; lng: number } | null;
  onSelectProperty: (property: Property) => void;
  onClose: () => void;
}

type Period = 'day' | 'week' | 'month';

interface KpiGoal {
  visits: number;
  interphone: number;
  faceToFace: number;
  measurements: number;
  appointments: number;
  contracts: number;
}

const GOAL_STORAGE_KEY = 'paint-map-kpi-goals-v2';

const DEFAULT_MONTHLY_GOAL: KpiGoal = {
  visits: 500,
  interphone: 130,
  faceToFace: 50,
  measurements: 4,
  appointments: 3,
  contracts: 1,
};

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

// Get date range for the period
function getDateRange(period: Period): { start: Date; end: Date; label: string } {
  const now = new Date();
  if (period === 'day') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { start, end, label: `${now.getMonth() + 1}/${now.getDate()}` };
  }
  if (period === 'week') {
    const day = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((day + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59);
    return { start: monday, end: sunday, label: `${monday.getMonth() + 1}/${monday.getDate()}〜${sunday.getMonth() + 1}/${sunday.getDate()}` };
  }
  // month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  return { start, end, label: `${now.getFullYear()}年${now.getMonth() + 1}月` };
}

// Get workdays in the period (excluding Sunday)
function getWorkdaysInRange(start: Date, end: Date): number {
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (cur.getDay() !== 0) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function getRemainingWorkdays(end: Date): number {
  const now = new Date();
  if (now > end) return 0;
  let count = 0;
  const cur = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  while (cur <= end) {
    if (cur.getDay() !== 0) count++;
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

// Parse date string (handles both ISO and 2026/4/7 18:30:00 formats)
function parseDate(s: string): Date | null {
  if (!s) return null;
  const d = new Date(s.replace(/\//g, '-').replace(' ', 'T'));
  if (isNaN(d.getTime())) return null;
  return d;
}

// Scale monthly goal to period
function scaleGoal(monthly: KpiGoal, period: Period, range: { start: Date; end: Date }): KpiGoal {
  if (period === 'month') return monthly;
  const monthWorkdays = getWorkdaysInRange(
    new Date(range.start.getFullYear(), range.start.getMonth(), 1),
    new Date(range.start.getFullYear(), range.start.getMonth() + 1, 0)
  );
  const periodWorkdays = period === 'day' ? 1 : getWorkdaysInRange(range.start, range.end);
  const ratio = periodWorkdays / monthWorkdays;
  return {
    visits: Math.ceil(monthly.visits * ratio),
    interphone: Math.ceil(monthly.interphone * ratio),
    faceToFace: Math.ceil(monthly.faceToFace * ratio),
    measurements: Math.ceil(monthly.measurements * ratio),
    appointments: Math.ceil(monthly.appointments * ratio),
    contracts: Math.ceil(monthly.contracts * ratio),
  };
}

export function VisitPlan({ properties, userPosition, onSelectProperty, onClose }: VisitPlanProps) {
  const [period, setPeriod] = useState<Period>('day');
  const [showGoalEdit, setShowGoalEdit] = useState(false);
  const [monthlyGoal, setMonthlyGoal] = useState<KpiGoal>(DEFAULT_MONTHLY_GOAL);

  // Load saved goal
  useEffect(() => {
    const saved = localStorage.getItem(GOAL_STORAGE_KEY);
    if (saved) {
      try {
        const g = JSON.parse(saved);
        setMonthlyGoal({ ...DEFAULT_MONTHLY_GOAL, ...g });
      } catch { /* ignore */ }
    }
  }, []);

  const saveGoal = (g: KpiGoal) => {
    setMonthlyGoal(g);
    localStorage.setItem(GOAL_STORAGE_KEY, JSON.stringify(g));
  };

  const range = useMemo(() => getDateRange(period), [period]);
  const goal = useMemo(() => scaleGoal(monthlyGoal, period, range), [monthlyGoal, period, range]);

  const stats = useMemo(() => {
    // Filter properties whose last_visit_date or visit history falls in range
    const inRange = properties.filter((p) => {
      const d = parseDate(p.last_visit_date);
      if (!d) return false;
      return d >= range.start && d <= range.end;
    });

    // Count by status
    const visits = inRange.length;
    const interphone = inRange.filter((p) => p.status === 'interphone' || p.status === 'child' || p.status === 'grandmother' || p.status === 'grandfather' || p.status === 'ng' || p.status === 'instant_return').length;
    const faceToFace = inRange.filter((p) => p.status !== 'absent' && p.status !== 'interphone').length;
    const measurements = inRange.filter((p) => p.status === 'measured').length;
    const appointments = inRange.filter((p) => p.status === 'appointment').length;
    const contracts = inRange.filter((p) => p.status === 'contract' || p.status === 'completed').length;

    const remaining = getRemainingWorkdays(range.end);
    const perDay = period === 'day' ? 1 : remaining;

    return {
      visits, interphone, faceToFace, measurements, appointments, contracts,
      remaining, perDay,
    };
  }, [properties, range, period]);

  // Today's visit list (always uses current properties regardless of period)
  const todayList = useMemo(() => {
    const revisitList = properties
      .filter((p) => p.revisit && p.status !== 'contract' && p.status !== 'completed' && p.status !== 'impossible')
      .map((p) => ({
        ...p,
        priority: 1,
        reason: getRevisitReason(p),
        distance: userPosition ? getDistance(userPosition.lat, userPosition.lng, p.lat, p.lng) : 0,
      }));
    revisitList.sort((a, b) => a.distance - b.distance);

    const hotLeads = properties
      .filter((p) => !p.revisit && (p.status === 'measured' || p.status === 'ng'))
      .map((p) => ({
        ...p,
        priority: 2,
        reason: p.status === 'measured' ? 'アポ取り推奨' : '話し込み済み・フォロー推奨',
        distance: userPosition ? getDistance(userPosition.lat, userPosition.lng, p.lat, p.lng) : 0,
      }));
    hotLeads.sort((a, b) => a.distance - b.distance);

    return [...revisitList, ...hotLeads];
  }, [properties, userPosition]);

  function getRevisitReason(p: Property): string {
    const days = daysSince(p.last_visit_date);
    const statusCfg = getStatusConfig(p.status);
    if (days < 999) return `${statusCfg.label}・${days}日前`;
    return statusCfg.label;
  }

  const handleStartRoute = () => {
    const routeProperties = todayList.slice(0, 10);
    if (routeProperties.length > 0 && userPosition) {
      const waypoints = routeProperties.map((p) => `${p.lat},${p.lng}`).join('/');
      const url = `https://www.google.com/maps/dir/${userPosition.lat},${userPosition.lng}/${waypoints}`;
      window.open(url, '_blank');
    }
  };

  const periodLabels: Record<Period, string> = { day: '日', week: '週', month: '月' };

  return (
    <div className="absolute inset-0 bg-gray-50 overflow-y-auto pb-16">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">訪問プラン</h1>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl">×</button>
        </div>
        {/* Period tabs */}
        <div className="flex gap-1 px-4 pb-2">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold ${period === p ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}
            >
              {periodLabels[p]}次
            </button>
          ))}
        </div>
      </div>

      {/* KPI dashboard */}
      <div className="px-4 pt-4 pb-2">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-700">{periodLabels[period]}次目標（{range.label}）</h2>
            <button
              onClick={() => setShowGoalEdit(!showGoalEdit)}
              className="text-xs text-blue-500 font-bold"
            >
              {showGoalEdit ? '閉じる' : '月間目標を設定'}
            </button>
          </div>

          {showGoalEdit && (
            <GoalEditor
              goal={monthlyGoal}
              onSave={(g) => {
                saveGoal(g);
                setShowGoalEdit(false);
              }}
            />
          )}

          {/* KPI rows */}
          <div className="space-y-2">
            <KpiRow label="訪問" current={stats.visits} target={goal.visits} color="#9E9E9E" />
            <KpiRow label="インターホン" current={stats.interphone} target={goal.interphone} color="#FF9800" />
            <KpiRow label="対面" current={stats.faceToFace} target={goal.faceToFace} color="#4CAF50" />
            <KpiRow label="計測" current={stats.measurements} target={goal.measurements} color="#9C27B0" />
            <KpiRow label="アポ" current={stats.appointments} target={goal.appointments} color="#2196F3" />
            <KpiRow label="成約" current={stats.contracts} target={goal.contracts} color="#F44336" />
          </div>

          {period !== 'day' && stats.remaining > 0 && (
            <div className="mt-3 pt-3 border-t">
              <p className="text-xs text-gray-500">残り営業日: <span className="font-bold text-gray-700">{stats.remaining}日</span></p>
              <p className="text-xs text-gray-500 mt-0.5">
                1日あたり必要訪問数: <span className="font-bold text-blue-600">{Math.max(0, Math.ceil((goal.visits - stats.visits) / stats.remaining))}件</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Today's Visit Plan */}
      <div className="px-4 pb-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-bold text-gray-700">今日の訪問リスト</h2>
        </div>

        {todayList.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-6 text-center text-gray-400 text-sm">
            再訪問フラグが立っているピンがありません。<br />
            ピンの詳細画面で「再訪問」ボタンを押すと<br />
            ここにリストが表示されます。
          </div>
        ) : (
          <>
            <div className="space-y-2">
              {todayList.map((p, i) => {
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
                    {distKm && <span className="text-xs text-gray-400 shrink-0">{distKm}km</span>}
                  </div>
                );
              })}
            </div>
            <button
              onClick={handleStartRoute}
              className="w-full mt-3 py-4 bg-green-500 text-white rounded-xl font-bold text-sm active:bg-green-600 flex items-center justify-center gap-2"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21.71 11.29l-9-9a.996.996 0 00-1.41 0l-9 9a.996.996 0 000 1.41l9 9c.39.39 1.02.39 1.41 0l9-9a.996.996 0 000-1.41zM14 14.5V12h-4v3H8v-4c0-.55.45-1 1-1h5V7.5l3.5 3.5-3.5 3.5z" />
              </svg>
              Googleマップでルート案内（上位{Math.min(todayList.length, 10)}件）
            </button>
          </>
        )}
      </div>

      <div className="h-8" />
    </div>
  );
}

function KpiRow({ label, current, target, color }: { label: string; current: number; target: number; color: string }) {
  const rate = target > 0 ? Math.min((current / target) * 100, 100) : 0;
  const achieved = target > 0 && current >= target;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-xs font-bold text-gray-700">{label}</span>
        <span className="text-xs">
          <span className={`font-black ${achieved ? 'text-green-600' : 'text-gray-800'}`}>{current}</span>
          <span className="text-gray-400">/{target}</span>
          <span className="text-gray-400 ml-1">({Math.round(rate)}%)</span>
        </span>
      </div>
      <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${rate}%`, backgroundColor: color, minWidth: current > 0 ? '4px' : '0' }}
        />
      </div>
    </div>
  );
}

function GoalEditor({ goal, onSave }: { goal: KpiGoal; onSave: (g: KpiGoal) => void }) {
  const [g, setG] = useState(goal);
  const fields: Array<{ key: keyof KpiGoal; label: string }> = [
    { key: 'visits', label: '訪問' },
    { key: 'interphone', label: 'インターホン' },
    { key: 'faceToFace', label: '対面' },
    { key: 'measurements', label: '計測' },
    { key: 'appointments', label: 'アポ' },
    { key: 'contracts', label: '成約' },
  ];
  return (
    <div className="bg-gray-50 rounded-lg p-3 mb-3">
      <p className="text-xs font-bold text-gray-600 mb-2">月間目標を入力</p>
      <div className="grid grid-cols-2 gap-2">
        {fields.map((f) => (
          <div key={f.key}>
            <label className="text-[10px] text-gray-500">{f.label}</label>
            <input
              type="number"
              className="w-full border rounded-lg px-2 py-1.5 text-sm"
              value={g[f.key]}
              onChange={(e) => setG({ ...g, [f.key]: parseInt(e.target.value) || 0 })}
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => onSave(g)}
        className="w-full mt-3 py-2 bg-blue-500 text-white rounded-lg text-sm font-bold"
      >
        保存
      </button>
    </div>
  );
}
