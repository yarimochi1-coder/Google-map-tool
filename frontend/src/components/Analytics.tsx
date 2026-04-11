import { useMemo, useState, useEffect } from 'react';
import type { Property } from '../types';
import { gasGet } from '../lib/gasClient';
import { PAST_DAILY_STATS, PAST_TOTALS, type PastDailyStat } from '../lib/pastData';

interface VisitRecord {
  property_id: string;
  status: string;
  staff: string;
  visited_at: string;
  memo: string;
}

interface AnalyticsProps {
  properties: Property[];
  onClose: () => void;
}

// 接触ステータス
const CONTACT_STATUSES = ['interphone', 'child', 'grandmother', 'grandfather', 'instant_return', 'ng'];
// 対面ステータス
const FACE_STATUSES = ['instant_return', 'ng'];

type DateRange = { start: string; end: string; label: string };

function isDateInRange(dateStr: any, start: string, end: string): boolean {
  if (!dateStr) return false;
  const s = String(dateStr);
  const datePart = s.split(' ')[0].split('T')[0].replace(/\//g, '-');
  const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return false;
  const padded = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  return padded >= start && padded <= end;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function Analytics({ properties, onClose }: AnalyticsProps) {
  const [visitHistory, setVisitHistory] = useState<VisitRecord[]>([]);
  useEffect(() => {
    gasGet<VisitRecord[]>('history').then((res) => {
      if (res.success && res.data) setVisitHistory(res.data);
    }).catch(() => {});
  }, []);

  // 期間設定
  const [rangeType, setRangeType] = useState<'all' | 'month' | 'week' | 'custom'>('all');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return formatDate(d);
  });
  const [customEnd, setCustomEnd] = useState(() => formatDate(new Date()));

  const dateRange = useMemo((): DateRange | null => {
    const today = new Date();
    if (rangeType === 'all') return null; // null = フィルタなし
    if (rangeType === 'week') {
      const start = new Date(today);
      start.setDate(today.getDate() - 7);
      return { start: formatDate(start), end: formatDate(today), label: '過去7日間' };
    }
    if (rangeType === 'month') {
      const start = new Date(today);
      start.setMonth(today.getMonth() - 1);
      return { start: formatDate(start), end: formatDate(today), label: '過去1ヶ月' };
    }
    return { start: customStart, end: customEnd, label: `${customStart} 〜 ${customEnd}` };
  }, [rangeType, customStart, customEnd]);

  const stats = useMemo(() => {
    if (properties.length === 0) return null;

    // 期間フィルタ
    const filtered = dateRange
      ? properties.filter((p) => {
          const dateRef = p.last_visit_date || p.created_at;
          if (!dateRef) return true;
          return isDateInRange(dateRef, dateRange.start, dateRange.end);
        })
      : properties;

    // 施工済み・成約を除外
    const visitProps = filtered.filter((p) => p.status !== 'completed' && p.status !== 'contract');
    const totalVisits = visitProps.length;

    // ファネル用カウント
    const contacts = visitProps.filter((p) => CONTACT_STATUSES.includes(p.status)).length;
    const faceToFace = visitProps.filter((p) => FACE_STATUSES.includes(p.status)).length;
    const talkCount = visitProps.filter((p) => p.status === 'ng').length;
    const measured = filtered.filter((p) => p.status === 'measured').length;
    const appointments = filtered.filter((p) => p.status === 'appointment').length;
    const contracts = filtered.filter((p) => p.status === 'contract').length;

    // ファネル（各段階の率は前段階に対する割合）
    const funnel = [
      { label: '総訪問', value: totalVisits, rate: 100, color: '#64B5F6' },
      { label: '総接触数', value: contacts, rate: totalVisits > 0 ? Math.round(contacts / totalVisits * 100) : 0, color: '#4CAF50' },
      { label: '総対面数', value: faceToFace, rate: contacts > 0 ? Math.round(faceToFace / contacts * 100) : 0, color: '#FF9800' },
      { label: '総話し込み数', value: talkCount, rate: faceToFace > 0 ? Math.round(talkCount / faceToFace * 100) : 0, color: '#9C27B0' },
      { label: '総計測数', value: measured, rate: talkCount > 0 ? Math.round(measured / talkCount * 100) : 0, color: '#00BCD4' },
      { label: '総アポ数', value: appointments, rate: measured > 0 ? Math.round(appointments / measured * 100) : 0, color: '#2196F3' },
      { label: '総成約数', value: contracts, rate: appointments > 0 ? Math.round(appointments > 0 ? contracts / appointments * 100 : 0) : 0, color: '#F44336' },
    ];
    const overallRate = totalVisits > 0 ? (contracts / totalVisits * 100).toFixed(2) : '0';

    // 成約系KPI
    const contractProps = filtered.filter((p) => p.status === 'contract');
    const avgVisits = contractProps.length > 0
      ? (contractProps.reduce((sum, p) => sum + (p.visit_count || 1), 0) / contractProps.length).toFixed(1)
      : '-';
    const amounts = contractProps.map((p) => Number(p.contract_amount)).filter((a) => a > 0);
    const avgAmount = amounts.length > 0
      ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length)
      : 0;

    // 時間帯別在宅率 (10時〜19時) from visit_history
    const hourly: Record<number, { total: number; contacted: number }> = {};
    for (let h = 10; h <= 19; h++) hourly[h] = { total: 0, contacted: 0 };

    // visit_historyをフィルタ
    const visitedKey = new Set<string>();
    const filteredHistory = visitHistory.filter((r) => {
      if (r.memo === 'ステータス修正') return false;
      if (r.status === 'completed' || r.status === 'contract') return false;
      // 期間フィルタ
      if (dateRange && !isDateInRange(r.visited_at, dateRange.start, dateRange.end)) return false;
      const dateStr = String(r.visited_at || '');
      const datePart = dateStr.split(' ')[0].split('T')[0].replace(/\//g, '-');
      const key = `${r.property_id}_${datePart}`;
      if (visitedKey.has(key)) return false;
      visitedKey.add(key);
      return true;
    });

    filteredHistory.forEach((r) => {
      const dateStr = String(r.visited_at || '');
      let h: number | null = null;
      const m1 = dateStr.match(/\s(\d{1,2}):/);
      const m2 = dateStr.match(/T(\d{1,2}):/);
      if (m1) h = parseInt(m1[1]);
      else if (m2) h = parseInt(m2[1]);
      if (h !== null && hourly[h] !== undefined) {
        hourly[h].total++;
        if (r.status !== 'absent') hourly[h].contacted++;
      }
    });

    // 断り理由
    const rejections: Record<string, number> = {};
    filtered.forEach((p) => {
      if (p.rejection_reason) rejections[p.rejection_reason] = (rejections[p.rejection_reason] || 0) + 1;
    });
    const rejectionList = Object.entries(rejections).sort((a, b) => b[1] - a[1]);

    // 屋根種別
    const roofTypes: Record<string, number> = {};
    filtered.forEach((p) => {
      if (p.roof_type) roofTypes[p.roof_type] = (roofTypes[p.roof_type] || 0) + 1;
    });
    const roofList = Object.entries(roofTypes).sort((a, b) => b[1] - a[1]);

    // 担当者別
    const staffMap: Record<string, { visits: number; contacts: number; appos: number; contracts: number }> = {};
    visitProps.forEach((p) => {
      const s = p.staff || '未設定';
      if (!staffMap[s]) staffMap[s] = { visits: 0, contacts: 0, appos: 0, contracts: 0 };
      staffMap[s].visits++;
      if (CONTACT_STATUSES.includes(p.status)) staffMap[s].contacts++;
      if (p.status === 'appointment') staffMap[s].appos++;
    });
    filtered.filter((p) => p.status === 'contract').forEach((p) => {
      const s = p.staff || '未設定';
      if (!staffMap[s]) staffMap[s] = { visits: 0, contacts: 0, appos: 0, contracts: 0 };
      staffMap[s].contracts++;
    });
    const staffList = Object.entries(staffMap).sort((a, b) => b[1].visits - a[1].visits);

    return {
      totalVisits, funnel, overallRate,
      hourly,
      avgVisits, avgAmount,
      rejectionList, roofList,
      staffList,
    };
  }, [properties, visitHistory, dateRange]);

  if (!stats) {
    return (
      <div className="absolute inset-0 bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">データがありません</p>
      </div>
    );
  }

  const maxHourly = Math.max(...Object.values(stats.hourly).map((d) => d.total), 1);

  return (
    <div className="absolute inset-0 bg-gray-50 overflow-y-auto pb-16">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">数値分析</h1>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl">×</button>
        </div>

        {/* 期間設定 */}
        <div className="px-4 pb-3">
          <div className="flex gap-1 mb-2">
            {(['all', 'week', 'month', 'custom'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setRangeType(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                  rangeType === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'
                }`}
              >
                {{ all: '全期間', week: '7日', month: '1ヶ月', custom: '期間指定' }[t]}
              </button>
            ))}
          </div>
          {rangeType === 'custom' && (
            <div className="flex gap-2 items-center">
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="flex-1 border rounded-lg px-2 py-1.5 text-xs"
              />
              <span className="text-xs text-gray-400">〜</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="flex-1 border rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-2 p-4">
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-500">総合成約率</p>
          <p className="text-2xl font-black text-blue-600">{stats.overallRate}%</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-500">平均成約訪問数</p>
          <p className="text-2xl font-black text-green-600">{stats.avgVisits}</p>
        </div>
        <div className="bg-white rounded-xl p-3 shadow-sm text-center">
          <p className="text-[10px] text-gray-500">平均成約単価</p>
          <p className="text-lg font-black text-orange-600">{stats.avgAmount > 0 ? `¥${(stats.avgAmount / 10000).toFixed(0)}万` : '-'}</p>
        </div>
      </div>

      {/* Funnel */}
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">ファネル分析</h2>
        <div className="bg-white rounded-xl shadow-sm p-3 space-y-2">
          {stats.funnel.map((f, i) => (
            <div key={f.label}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className="font-bold text-gray-700">{f.label}</span>
                <span className="text-gray-500">
                  {f.value}件
                  {i > 0 && <span className="ml-1 font-bold" style={{ color: f.color }}>({f.rate}%)</span>}
                </span>
              </div>
              <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${stats.totalVisits > 0 ? (f.value / stats.totalVisits) * 100 : 0}%`,
                    backgroundColor: f.color,
                    minWidth: f.value > 0 ? '8px' : '0',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly 10時〜19時 */}
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">時間帯別在宅率</h2>
        <div className="bg-white rounded-xl shadow-sm p-3">
          {/* バーチャート */}
          <div className="flex items-end gap-1 h-28">
            {Object.entries(stats.hourly).map(([h, d]) => {
              const rate = d.total > 0 ? Math.round(d.contacted / d.total * 100) : 0;
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[9px] font-bold" style={{ color: rate >= 50 ? '#4CAF50' : rate > 0 ? '#FF9800' : '#ccc' }}>
                    {d.total > 0 ? `${rate}%` : ''}
                  </span>
                  <div className="w-full flex flex-col items-center" style={{ height: '70px' }}>
                    <div
                      className="w-full rounded-t"
                      style={{
                        height: `${(d.total / maxHourly) * 100}%`,
                        backgroundColor: rate >= 50 ? '#4CAF50' : rate > 0 ? '#FF9800' : '#E0E0E0',
                        minHeight: d.total > 0 ? '4px' : '0',
                        marginTop: 'auto',
                      }}
                    />
                  </div>
                  <span className="text-[9px] text-gray-500 font-bold">{h}時</span>
                </div>
              );
            })}
          </div>
          {/* 数値テーブル */}
          <div className="mt-3 divide-y">
            {Object.entries(stats.hourly).map(([h, d]) => {
              if (d.total === 0) return null;
              const rate = Math.round(d.contacted / d.total * 100);
              return (
                <div key={h} className="flex justify-between py-1 text-xs">
                  <span className="text-gray-600 font-bold">{h}時台</span>
                  <span className="text-gray-400">{d.total}件中 {d.contacted}件在宅</span>
                  <span className="font-bold" style={{ color: rate >= 50 ? '#4CAF50' : '#FF9800' }}>{rate}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Staff Performance */}
      {stats.staffList.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">担当者別パフォーマンス</h2>
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {stats.staffList.map(([name, d]) => (
              <div key={name} className="px-3 py-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-700">{name}</span>
                  <span className="text-xs text-gray-400">{d.visits}件訪問</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs">
                  <span className="text-green-600">接触率 {d.visits > 0 ? Math.round(d.contacts / d.visits * 100) : 0}%</span>
                  <span className="text-blue-600">アポ {d.appos}</span>
                  <span className="text-red-600">成約 {d.contracts}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Rejection Reasons */}
      {stats.rejectionList.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">断り理由の内訳</h2>
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {stats.rejectionList.map(([reason, count]) => (
              <div key={reason} className="flex justify-between px-3 py-2 text-sm">
                <span className="text-gray-700">{reason}</span>
                <span className="font-bold text-red-500">{count}件</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Roof Types */}
      {stats.roofList.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">屋根種類の内訳</h2>
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {stats.roofList.map(([type, count]) => (
              <div key={type} className="flex justify-between px-3 py-2 text-sm">
                <span className="text-gray-700">{type}</span>
                <span className="font-bold text-purple-500">{count}件</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Past Data Trends */}
      <PastDataSection dailyStats={PAST_DAILY_STATS} />

      <div className="h-8" />
    </div>
  );
}

function PastDataSection({ dailyStats }: { dailyStats: PastDailyStat[] }) {
  const monthly = useMemo(() => {
    const months: Record<string, { visits: number; contacts: number; faceToFace: number; measurements: number; appointments: number; contracts: number; days: number }> = {};
    dailyStats.forEach((d) => {
      const m = d.date.substring(0, 7);
      if (!months[m]) months[m] = { visits: 0, contacts: 0, faceToFace: 0, measurements: 0, appointments: 0, contracts: 0, days: 0 };
      months[m].visits += d.visits;
      months[m].contacts += d.contacts;
      months[m].faceToFace += d.faceToFace;
      months[m].measurements += d.measurements;
      months[m].appointments += d.appointments;
      months[m].contracts += d.contracts;
      months[m].days++;
    });
    return Object.entries(months).sort((a, b) => a[0].localeCompare(b[0]));
  }, [dailyStats]);

  const totals = PAST_TOTALS;
  const maxVisits = Math.max(...monthly.map(([, d]) => d.visits), 1);

  return (
    <>
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">過去実績（{dailyStats.length}日分）</h2>
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="grid grid-cols-3 gap-2 text-center mb-3">
            <div>
              <p className="text-[10px] text-gray-400">総訪問</p>
              <p className="text-lg font-black text-gray-800">{totals.visits.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">総アポ</p>
              <p className="text-lg font-black text-blue-600">{totals.appointments}</p>
            </div>
            <div>
              <p className="text-[10px] text-gray-400">総成約</p>
              <p className="text-lg font-black text-red-600">{totals.contracts}</p>
            </div>
          </div>
          <div className="space-y-1 text-xs text-gray-600">
            <div className="flex justify-between"><span>接触率</span><span className="font-bold">{totals.visits > 0 ? (totals.contacts / totals.visits * 100).toFixed(1) : 0}%</span></div>
            <div className="flex justify-between"><span>対面率</span><span className="font-bold">{totals.visits > 0 ? (totals.faceToFace / totals.visits * 100).toFixed(1) : 0}%</span></div>
            <div className="flex justify-between"><span>アポ率</span><span className="font-bold">{totals.visits > 0 ? (totals.appointments / totals.visits * 100).toFixed(2) : 0}%</span></div>
            <div className="flex justify-between"><span>成約率（対アポ）</span><span className="font-bold">{totals.appointments > 0 ? (totals.contracts / totals.appointments * 100).toFixed(1) : 0}%</span></div>
          </div>
        </div>
      </div>

      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">月別トレンド</h2>
        <div className="space-y-2">
          {monthly.map(([month, d]) => {
            const contactRate = d.visits > 0 ? (d.contacts / d.visits * 100).toFixed(0) : '0';
            return (
              <div key={month} className="bg-white rounded-xl shadow-sm p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-bold text-gray-700">{month.replace('-', '年')}月</span>
                  <span className="text-xs text-gray-400">{d.days}日稼働</span>
                </div>
                <div className="h-4 bg-gray-100 rounded-full overflow-hidden mb-1">
                  <div className="h-full rounded-full bg-blue-400" style={{ width: `${(d.visits / maxVisits) * 100}%`, minWidth: '4px' }} />
                </div>
                <div className="flex gap-3 text-[10px] text-gray-500">
                  <span>訪問{d.visits}</span>
                  <span>接触{d.contacts}({contactRate}%)</span>
                  <span>対面{d.faceToFace}</span>
                  <span className="text-blue-600 font-bold">アポ{d.appointments}</span>
                  <span className="text-red-600 font-bold">成約{d.contracts}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
