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

// 接触 = 不在以外（誰かが応答した）。施工済み・成約はfilterHistoryで除外済み
// ファネル用の接触（Dashboard定義）
const CONTACT_STATUSES_FUNNEL = ['interphone', 'child', 'grandmother', 'grandfather', 'instant_return', 'ng'];
// 対面 = 実際に顔を合わせた（計測・アポも対面を経由している）
const FACE_STATUSES = ['instant_return', 'ng', 'measured', 'appointment', 'impossible'];
const DOW_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

type DateRange = { start: string; end: string; label: string };

function isDateInRange(dateStr: any, start: string, end: string): boolean {
  if (!dateStr) return false;
  let padded: string | null = null;
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    padded = fmtDate(dateStr);
  } else {
    const s = String(dateStr);
    const datePart = s.split(' ')[0].split('T')[0].replace(/\//g, '-');
    const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      padded = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    } else {
      const d = new Date(s);
      if (!isNaN(d.getTime())) padded = fmtDate(d);
    }
  }
  if (!padded) return false;
  return padded >= start && padded <= end;
}

function fmtDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseHour(dateStr: any): number | null {
  // GASがDateオブジェクトで返す場合
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    return dateStr.getHours();
  }
  const s = String(dateStr || '');
  // "2026/4/7 17:12:08" or "2026-04-07T17:12:08"
  const m1 = s.match(/\s(\d{1,2}):/);
  const m2 = s.match(/T(\d{1,2}):/);
  if (m1) return parseInt(m1[1]);
  if (m2) return parseInt(m2[1]);
  // fallback: try Date parse
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getHours();
  return null;
}

function parseDow(dateStr: any): number | null {
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    return dateStr.getDay();
  }
  const s = String(dateStr || '');
  // try direct parse first
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.getDay();
  // manual parse
  const datePart = s.split(' ')[0].split('T')[0].replace(/\//g, '-');
  const d2 = new Date(datePart);
  return isNaN(d2.getTime()) ? null : d2.getDay();
}

// visit_historyをフィルタ
// 同日同物件は1回だけカウント（ステータス修正や重複を除外）
// ただし memo='再訪問' は明示的な再訪問なのでカウント
function filterHistory(history: VisitRecord[], dateRange: DateRange | null): VisitRecord[] {
  const visitedKey = new Set<string>();
  return history.filter((r) => {
    if (r.memo === 'ステータス修正') return false;
    if (r.status === 'completed' || r.status === 'contract') return false;
    if (dateRange && !isDateInRange(r.visited_at, dateRange.start, dateRange.end)) return false;
    // 再訪問ボタンで追加した記録は常にカウント
    if (r.memo === '再訪問') return true;
    // 同日同物件の重複を除外（最初の1件だけ残す）
    const dateStr = String(r.visited_at || '');
    let datePart: string;
    if ((r.visited_at as any) instanceof Date) {
      datePart = fmtDate(r.visited_at as any);
    } else {
      datePart = dateStr.split(' ')[0].split('T')[0].replace(/\//g, '-');
    }
    const key = `${r.property_id}_${datePart}`;
    if (visitedKey.has(key)) return false;
    visitedKey.add(key);
    return true;
  });
}

export function Analytics({ properties, onClose }: AnalyticsProps) {
  const [visitHistory, setVisitHistory] = useState<VisitRecord[]>([]);
  useEffect(() => {
    gasGet<VisitRecord[]>('history').then((res) => {
      if (res.success && res.data) setVisitHistory(res.data);
    }).catch(() => {});
  }, []);

  const [rangeType, setRangeType] = useState<'all' | 'month' | 'week' | 'custom'>('all');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return fmtDate(d);
  });
  const [customEnd, setCustomEnd] = useState(() => fmtDate(new Date()));

  const dateRange = useMemo((): DateRange | null => {
    const today = new Date();
    if (rangeType === 'all') return null;
    if (rangeType === 'week') {
      const s = new Date(today); s.setDate(today.getDate() - 7);
      return { start: fmtDate(s), end: fmtDate(today), label: '過去7日間' };
    }
    if (rangeType === 'month') {
      const s = new Date(today); s.setMonth(today.getMonth() - 1);
      return { start: fmtDate(s), end: fmtDate(today), label: '過去1ヶ月' };
    }
    return { start: customStart, end: customEnd, label: `${customStart} 〜 ${customEnd}` };
  }, [rangeType, customStart, customEnd]);

  const stats = useMemo(() => {
    if (properties.length === 0) return null;

    const filtered = dateRange
      ? properties.filter((p) => {
          const dateRef = p.last_visit_date || p.created_at;
          if (!dateRef) return true;
          return isDateInRange(dateRef, dateRange.start, dateRange.end);
        })
      : properties;

    const visitProps = filtered.filter((p) => p.status !== 'completed' && p.status !== 'contract');
    const totalVisits = visitProps.length;
    const contacts = visitProps.filter((p) => CONTACT_STATUSES_FUNNEL.includes(p.status)).length;
    const faceToFace = visitProps.filter((p) => FACE_STATUSES.includes(p.status)).length;
    const talkCount = visitProps.filter((p) => p.status === 'ng').length;
    const measured = filtered.filter((p) => p.status === 'measured').length;
    const appointments = filtered.filter((p) => p.status === 'appointment').length;
    const contracts = filtered.filter((p) => p.status === 'contract').length;

    const funnel = [
      { label: '総訪問', value: totalVisits, rate: 100, color: '#64B5F6' },
      { label: '総接触数', value: contacts, rate: totalVisits > 0 ? Math.round(contacts / totalVisits * 100) : 0, color: '#4CAF50' },
      { label: '総対面数', value: faceToFace, rate: contacts > 0 ? Math.round(faceToFace / contacts * 100) : 0, color: '#FF9800' },
      { label: '総話し込み数', value: talkCount, rate: faceToFace > 0 ? Math.round(talkCount / faceToFace * 100) : 0, color: '#9C27B0' },
      { label: '総計測数', value: measured, rate: talkCount > 0 ? Math.round(measured / talkCount * 100) : 0, color: '#00BCD4' },
      { label: '総アポ数', value: appointments, rate: measured > 0 ? Math.round(appointments / measured * 100) : 0, color: '#2196F3' },
      { label: '総成約数', value: contracts, rate: appointments > 0 ? Math.round(contracts / appointments * 100) : 0, color: '#F44336' },
    ];
    const overallRate = totalVisits > 0 ? (contracts / totalVisits * 100).toFixed(2) : '0';

    const contractProps = filtered.filter((p) => p.status === 'contract');
    const avgVisits = contractProps.length > 0
      ? (contractProps.reduce((sum, p) => sum + (p.visit_count || 1), 0) / contractProps.length).toFixed(1) : '-';
    const amounts = contractProps.map((p) => Number(p.contract_amount)).filter((a) => a > 0);
    const avgAmount = amounts.length > 0 ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length) : 0;

    // --- visit_historyベースの分析 ---
    const fh = filterHistory(visitHistory, dateRange);

    // 時間帯別 (10〜19)
    type HourData = { total: number; contacted: number; faced: number };
    const hourly: Record<number, HourData> = {};
    for (let h = 10; h <= 19; h++) hourly[h] = { total: 0, contacted: 0, faced: 0 };

    fh.forEach((r) => {
      const h = parseHour(String(r.visited_at || ''));
      if (h !== null && hourly[h] !== undefined) {
        hourly[h].total++;
        // 在宅 = 不在以外すべて（誰かが応答した）
        if (r.status !== 'absent') hourly[h].contacted++;
        // 対面 = 実際に顔を合わせた（インターホン越し・子供対応は除く）
        if (FACE_STATUSES.includes(r.status)) hourly[h].faced++;
      }
    });

    // 曜日別
    type DowData = { total: number; contacted: number; faced: number };
    const dowStats: Record<number, DowData> = {};
    for (let d = 0; d < 7; d++) dowStats[d] = { total: 0, contacted: 0, faced: 0 };

    fh.forEach((r) => {
      const dow = parseDow(String(r.visited_at || ''));
      if (dow !== null) {
        dowStats[dow].total++;
        if (r.status !== 'absent') dowStats[dow].contacted++;
        if (FACE_STATUSES.includes(r.status)) dowStats[dow].faced++;
      }
    });

    // 平日 vs 土日
    const weekday = { total: 0, contacted: 0, faced: 0 };
    const weekend = { total: 0, contacted: 0, faced: 0 };
    fh.forEach((r) => {
      const dow = parseDow(String(r.visited_at || ''));
      if (dow === null) return;
      const bucket = (dow === 0 || dow === 6) ? weekend : weekday;
      bucket.total++;
      if (r.status !== 'absent') bucket.contacted++;
      if (FACE_STATUSES.includes(r.status)) bucket.faced++;
    });

    // クロス分析: 曜日×時間帯
    type CrossCell = { total: number; contacted: number; faced: number };
    const cross: Record<string, CrossCell> = {};
    for (let d = 0; d < 7; d++) {
      for (let h = 10; h <= 19; h++) {
        cross[`${d}_${h}`] = { total: 0, contacted: 0, faced: 0 };
      }
    }
    fh.forEach((r) => {
      const dow = parseDow(String(r.visited_at || ''));
      const h = parseHour(String(r.visited_at || ''));
      if (dow === null || h === null || h < 10 || h > 19) return;
      const key = `${dow}_${h}`;
      cross[key].total++;
      if (r.status !== 'absent') cross[key].contacted++;
      if (FACE_STATUSES.includes(r.status)) cross[key].faced++;
    });

    // 担当者別
    const staffMap: Record<string, { visits: number; contacts: number; appos: number; contracts: number }> = {};
    visitProps.forEach((p) => {
      const s = p.staff || '未設定';
      if (!staffMap[s]) staffMap[s] = { visits: 0, contacts: 0, appos: 0, contracts: 0 };
      staffMap[s].visits++;
      if (CONTACT_STATUSES_FUNNEL.includes(p.status)) staffMap[s].contacts++;
      if (p.status === 'appointment') staffMap[s].appos++;
    });
    filtered.filter((p) => p.status === 'contract').forEach((p) => {
      const s = p.staff || '未設定';
      if (!staffMap[s]) staffMap[s] = { visits: 0, contacts: 0, appos: 0, contracts: 0 };
      staffMap[s].contracts++;
    });
    const staffList = Object.entries(staffMap).sort((a, b) => b[1].visits - a[1].visits);

    const rejections: Record<string, number> = {};
    filtered.forEach((p) => { if (p.rejection_reason) rejections[p.rejection_reason] = (rejections[p.rejection_reason] || 0) + 1; });
    const rejectionList = Object.entries(rejections).sort((a, b) => b[1] - a[1]);

    return {
      totalVisits, funnel, overallRate, avgVisits, avgAmount,
      hourly, dowStats, weekday, weekend, cross,
      staffList, rejectionList,
      historyCount: fh.length,
    };
  }, [properties, visitHistory, dateRange]);

  const [crossMetric, setCrossMetric] = useState<'contact' | 'face'>('contact');

  if (!stats) return <div className="absolute inset-0 bg-gray-50 flex items-center justify-center"><p className="text-gray-400">データがありません</p></div>;

  const maxHourly = Math.max(...Object.values(stats.hourly).map((d) => d.total), 1);

  return (
    <div className="absolute inset-0 bg-gray-50 overflow-y-auto pb-16">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">数値分析</h1>
          <button onClick={onClose} className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl">×</button>
        </div>
        <div className="px-4 pb-3">
          <div className="flex gap-1 mb-2">
            {(['all', 'week', 'month', 'custom'] as const).map((t) => (
              <button key={t} onClick={() => setRangeType(t)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${rangeType === t ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
                {{ all: '全期間', week: '7日', month: '1ヶ月', custom: '期間指定' }[t]}
              </button>
            ))}
          </div>
          {rangeType === 'custom' && (
            <div className="flex gap-2 items-center">
              <input type="date" value={customStart} onChange={(e) => setCustomStart(e.target.value)} className="flex-1 border rounded-lg px-2 py-1.5 text-xs" />
              <span className="text-xs text-gray-400">〜</span>
              <input type="date" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} className="flex-1 border rounded-lg px-2 py-1.5 text-xs" />
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
                <span className="text-gray-500">{f.value}件{i > 0 && <span className="ml-1 font-bold" style={{ color: f.color }}>({f.rate}%)</span>}</span>
              </div>
              <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${stats.totalVisits > 0 ? (f.value / stats.totalVisits) * 100 : 0}%`, backgroundColor: f.color, minWidth: f.value > 0 ? '8px' : '0' }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 時間帯別在宅率 & 対面率 */}
      {stats.historyCount === 0 && (
        <div className="px-4 pb-2">
          <p className="text-xs text-orange-500 bg-orange-50 rounded-lg px-3 py-2">
            ⚠ 訪問履歴が{stats.historyCount}件のみです。時間帯・曜日分析はアプリでステータス変更した訪問のみが対象です。データが蓄積されるほど精度が上がります。
          </p>
        </div>
      )}
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">時間帯別分析（10〜19時）<span className="text-xs font-normal text-gray-400 ml-1">n={stats.historyCount}</span></h2>
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="flex items-end gap-1 h-28">
            {Object.entries(stats.hourly).map(([h, d]) => {
              const contactRate = d.total > 0 ? Math.round(d.contacted / d.total * 100) : 0;
              const faceRate = d.total > 0 ? Math.round(d.faced / d.total * 100) : 0;
              return (
                <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                  <span className="text-[8px] font-bold text-green-600">{d.total > 0 ? `${contactRate}%` : ''}</span>
                  <span className="text-[8px] font-bold text-orange-500">{d.total > 0 ? `${faceRate}%` : ''}</span>
                  <div className="w-full flex flex-col items-center" style={{ height: '60px' }}>
                    <div className="w-full rounded-t" style={{ height: `${(d.total / maxHourly) * 100}%`, backgroundColor: contactRate >= 50 ? '#4CAF50' : contactRate > 0 ? '#FF9800' : '#E0E0E0', minHeight: d.total > 0 ? '4px' : '0', marginTop: 'auto' }} />
                  </div>
                  <span className="text-[9px] text-gray-500 font-bold">{h}時</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" />在宅率</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-500" />対面率</span>
          </div>
          {/* テーブル */}
          <div className="mt-3 divide-y text-[11px]">
            <div className="flex py-1 font-bold text-gray-500">
              <span className="w-12">時間</span><span className="flex-1 text-center">訪問</span><span className="flex-1 text-center">在宅率</span><span className="flex-1 text-center">対面率</span>
            </div>
            {Object.entries(stats.hourly).map(([h, d]) => {
              if (d.total === 0) return null;
              return (
                <div key={h} className="flex py-1">
                  <span className="w-12 font-bold text-gray-600">{h}時</span>
                  <span className="flex-1 text-center text-gray-400">{d.total}件</span>
                  <span className="flex-1 text-center font-bold text-green-600">{Math.round(d.contacted / d.total * 100)}%</span>
                  <span className="flex-1 text-center font-bold text-orange-500">{Math.round(d.faced / d.total * 100)}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 曜日別分析 - 10件以上で表示 */}
      {stats.historyCount >= 1 && <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">曜日別分析 <span className="text-xs font-normal text-gray-400">n={stats.historyCount}</span></h2>
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="divide-y text-[11px]">
            <div className="flex py-1 font-bold text-gray-500">
              <span className="w-10">曜日</span><span className="flex-1 text-center">訪問</span><span className="flex-1 text-center">在宅率</span><span className="flex-1 text-center">対面率</span><span className="flex-1 text-center">接触率</span>
            </div>
            {[1, 2, 3, 4, 5, 6, 0].map((dow) => {
              const d = stats.dowStats[dow];
              if (d.total === 0) return null;
              const contactRate = Math.round(d.contacted / d.total * 100);
              const faceRate = Math.round(d.faced / d.total * 100);
              return (
                <div key={dow} className="flex py-1.5">
                  <span className={`w-10 font-bold ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'}`}>{DOW_LABELS[dow]}</span>
                  <span className="flex-1 text-center text-gray-400">{d.total}件</span>
                  <span className="flex-1 text-center font-bold text-green-600">{contactRate}%</span>
                  <span className="flex-1 text-center font-bold text-orange-500">{faceRate}%</span>
                  <span className="flex-1 text-center font-bold text-blue-600">{contactRate}%</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>}

      {/* 平日 vs 土日 - 10件以上で表示 */}
      {stats.historyCount >= 1 && <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">平日 vs 土日 <span className="text-xs font-normal text-gray-400">n={stats.historyCount}</span></h2>
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: '平日', data: stats.weekday, color: '#2196F3' },
              { label: '土日', data: stats.weekend, color: '#FF9800' },
            ].map(({ label, data, color }) => {
              const contactRate = data.total > 0 ? Math.round(data.contacted / data.total * 100) : 0;
              const faceRate = data.total > 0 ? Math.round(data.faced / data.total * 100) : 0;
              return (
                <div key={label} className="text-center p-2 rounded-lg" style={{ backgroundColor: color + '10' }}>
                  <p className="text-xs font-bold" style={{ color }}>{label}</p>
                  <p className="text-lg font-black text-gray-800">{data.total}件</p>
                  <div className="flex justify-center gap-3 mt-1 text-[10px]">
                    <span className="text-green-600">在宅 {contactRate}%</span>
                    <span className="text-orange-500">対面 {faceRate}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>}

      {/* クロス分析: 曜日×時間帯 - 20件以上で表示 */}
      {stats.historyCount >= 1 && <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">クロス分析（曜日×時間帯）<span className="text-xs font-normal text-gray-400 ml-1">n={stats.historyCount}</span></h2>
        <div className="flex gap-1 mb-2">
          <button onClick={() => setCrossMetric('contact')}
            className={`flex-1 py-1 rounded-lg text-xs font-bold ${crossMetric === 'contact' ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>在宅率</button>
          <button onClick={() => setCrossMetric('face')}
            className={`flex-1 py-1 rounded-lg text-xs font-bold ${crossMetric === 'face' ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-500'}`}>対面率</button>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-2 overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr>
                <th className="p-1 text-gray-500">曜日＼時間</th>
                {Array.from({ length: 10 }, (_, i) => i + 10).map((h) => (
                  <th key={h} className="p-1 text-gray-500 text-center">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {[1, 2, 3, 4, 5, 6, 0].map((dow) => (
                <tr key={dow}>
                  <td className={`p-1 font-bold ${dow === 0 ? 'text-red-500' : dow === 6 ? 'text-blue-500' : 'text-gray-700'}`}>
                    {DOW_LABELS[dow]}
                  </td>
                  {Array.from({ length: 10 }, (_, i) => i + 10).map((h) => {
                    const cell = stats.cross[`${dow}_${h}`];
                    if (!cell || cell.total === 0) return <td key={h} className="p-1 text-center text-gray-200">-</td>;
                    const rate = crossMetric === 'contact'
                      ? Math.round(cell.contacted / cell.total * 100)
                      : Math.round(cell.faced / cell.total * 100);
                    const bg = rate >= 60 ? '#4CAF50' : rate >= 40 ? '#FF9800' : rate > 0 ? '#F44336' : '#eee';
                    return (
                      <td key={h} className="p-0.5 text-center">
                        <span className="inline-block w-full rounded px-0.5 py-0.5 text-white font-bold" style={{ backgroundColor: bg, fontSize: '8px' }}>
                          {rate}%
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-2 mt-2 text-[9px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ backgroundColor: '#4CAF50' }} />60%+</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ backgroundColor: '#FF9800' }} />40-59%</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded" style={{ backgroundColor: '#F44336' }} />40%未満</span>
          </div>
        </div>
      </div>}

      {/* Staff Performance */}
      {stats.staffList.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">担当者別</h2>
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {stats.staffList.map(([name, d]) => (
              <div key={name} className="px-3 py-2">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-bold text-gray-700">{name}</span>
                  <span className="text-xs text-gray-400">{d.visits}件</span>
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
          <h2 className="text-sm font-bold text-gray-700 mb-2">断り理由</h2>
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

      {/* Past Data */}
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
      months[m].visits += d.visits; months[m].contacts += d.contacts; months[m].faceToFace += d.faceToFace;
      months[m].measurements += d.measurements; months[m].appointments += d.appointments; months[m].contracts += d.contracts; months[m].days++;
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
            <div><p className="text-[10px] text-gray-400">総訪問</p><p className="text-lg font-black text-gray-800">{totals.visits.toLocaleString()}</p></div>
            <div><p className="text-[10px] text-gray-400">総アポ</p><p className="text-lg font-black text-blue-600">{totals.appointments}</p></div>
            <div><p className="text-[10px] text-gray-400">総成約</p><p className="text-lg font-black text-red-600">{totals.contracts}</p></div>
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
          {monthly.map(([month, d]) => (
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
                <span>接触{d.contacts}({d.visits > 0 ? (d.contacts / d.visits * 100).toFixed(0) : 0}%)</span>
                <span>対面{d.faceToFace}</span>
                <span className="text-blue-600 font-bold">アポ{d.appointments}</span>
                <span className="text-red-600 font-bold">成約{d.contracts}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
