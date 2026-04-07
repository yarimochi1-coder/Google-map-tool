import { useMemo } from 'react';
import type { Property } from '../types';
import { STATUS_LIST } from '../lib/statusConfig';
import { PAST_DAILY_STATS, PAST_TOTALS, type PastDailyStat } from '../lib/pastData';

interface AnalyticsProps {
  properties: Property[];
  onClose: () => void;
}

export function Analytics({ properties, onClose }: AnalyticsProps) {
  const stats = useMemo(() => {
    // Exclude '施工済み' from visit-related stats
    const visitProps = properties.filter((p) => p.status !== 'completed');
    const total = visitProps.length;
    if (properties.length === 0) return null;

    // Status counts (all statuses including completed)
    const sc: Record<string, number> = {};
    STATUS_LIST.forEach((s) => { sc[s.key] = 0; });
    properties.forEach((p) => { sc[p.status] = (sc[p.status] || 0) + 1; });

    const absent = sc['absent'] || 0;
    const contacted = total - absent;
    const measured = sc['measured'] || 0;
    const appointment = sc['appointment'] || 0;
    const contract = sc['contract'] || 0;
    const successTotal = contract;

    // Funnel
    const funnel = [
      { label: '総訪問', value: total, rate: 100 },
      { label: '在宅（対面）', value: contacted, rate: total > 0 ? Math.round(contacted / total * 100) : 0 },
      { label: '計測済み', value: measured, rate: contacted > 0 ? Math.round(measured / contacted * 100) : 0 },
      { label: 'アポ獲得', value: appointment, rate: measured > 0 ? Math.round(appointment / measured * 100) : 0 },
      { label: '成約', value: successTotal, rate: appointment > 0 ? Math.round(successTotal / appointment * 100) : 0 },
    ];
    const overallRate = total > 0 ? (successTotal / total * 100).toFixed(1) : '0';

    // Hourly analysis
    const hourly: Record<number, { total: number; contacted: number; appo: number }> = {};
    for (let h = 7; h <= 21; h++) hourly[h] = { total: 0, contacted: 0, appo: 0 };

    visitProps.forEach((p) => {
      const match = (p.last_visit_date || '').match(/(\d{1,2}):/);
      if (match) {
        const h = parseInt(match[1]);
        if (hourly[h]) {
          hourly[h].total++;
          if (p.status !== 'absent') hourly[h].contacted++;
          if (p.status === 'appointment' || p.status === 'contract') hourly[h].appo++;
        }
      }
    });

    const bestHour = Object.entries(hourly).reduce((best, [h, d]) => {
      const rate = d.total > 0 ? d.contacted / d.total : 0;
      return rate > best.rate ? { hour: Number(h), rate, data: d } : best;
    }, { hour: 0, rate: 0, data: { total: 0, contacted: 0, appo: 0 } });

    // Response type analysis
    const responseTypes = ['child', 'grandmother', 'grandfather'] as const;
    const responseStats = responseTypes.map((type) => {
      const cfg = STATUS_LIST.find((s) => s.key === type);
      const count = sc[type] || 0;
      return { key: type, label: cfg?.label || type, icon: cfg?.icon || '', count };
    });

    // Rejection reasons
    const rejections: Record<string, number> = {};
    properties.forEach((p) => {
      if (p.rejection_reason) {
        rejections[p.rejection_reason] = (rejections[p.rejection_reason] || 0) + 1;
      }
    });
    const rejectionList = Object.entries(rejections).sort((a, b) => b[1] - a[1]);

    // Roof type breakdown
    const roofTypes: Record<string, number> = {};
    properties.forEach((p) => {
      if (p.roof_type) {
        roofTypes[p.roof_type] = (roofTypes[p.roof_type] || 0) + 1;
      }
    });
    const roofList = Object.entries(roofTypes).sort((a, b) => b[1] - a[1]);

    // Average visits to contract (only actual contracts, not completed=自社施工)
    const contractProps = properties.filter((p) => p.status === 'contract');
    const avgVisits = contractProps.length > 0
      ? (contractProps.reduce((sum, p) => sum + (p.visit_count || 1), 0) / contractProps.length).toFixed(1)
      : '-';

    // Average contract amount
    const amounts = contractProps.map((p) => Number(p.contract_amount)).filter((a) => a > 0);
    const avgAmount = amounts.length > 0
      ? Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length)
      : 0;

    // Staff performance (exclude 施工済み)
    const staffMap: Record<string, { visits: number; contacts: number; appos: number; contracts: number }> = {};
    visitProps.forEach((p) => {
      const s = p.staff || '未設定';
      if (!staffMap[s]) staffMap[s] = { visits: 0, contacts: 0, appos: 0, contracts: 0 };
      staffMap[s].visits++;
      if (p.status !== 'absent') staffMap[s].contacts++;
      if (p.status === 'appointment') staffMap[s].appos++;
      if (p.status === 'contract') staffMap[s].contracts++;
    });
    const staffList = Object.entries(staffMap).sort((a, b) => b[1].visits - a[1].visits);

    return {
      total, contacted, funnel, overallRate,
      hourly, bestHour,
      responseStats,
      rejectionList, roofList,
      avgVisits, avgAmount,
      staffList, sc,
    };
  }, [properties]);

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
                <span className="text-gray-500">{f.value}件 ({f.rate}%)</span>
              </div>
              <div className="h-5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${stats.total > 0 ? (f.value / stats.total) * 100 : 0}%`,
                    backgroundColor: ['#64B5F6','#4CAF50','#9C27B0','#2196F3','#F44336'][i],
                    minWidth: f.value > 0 ? '8px' : '0',
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Hourly */}
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">
          時間帯別在宅率
          {stats.bestHour.data.total > 0 && (
            <span className="text-xs font-normal text-blue-500 ml-2">
              ベスト: {stats.bestHour.hour}時台（{Math.round(stats.bestHour.rate * 100)}%）
            </span>
          )}
        </h2>
        <div className="bg-white rounded-xl shadow-sm p-3">
          <div className="flex items-end gap-1 h-24">
            {Object.entries(stats.hourly).map(([h, d]) => (
              <div key={h} className="flex-1 flex flex-col items-center gap-0.5">
                <div className="w-full flex flex-col items-center" style={{ height: '80px' }}>
                  <div
                    className="w-full rounded-t"
                    style={{
                      height: `${(d.total / maxHourly) * 100}%`,
                      backgroundColor: d.total > 0 && d.contacted / d.total > 0.5 ? '#4CAF50' : '#E0E0E0',
                      minHeight: d.total > 0 ? '4px' : '0',
                      marginTop: 'auto',
                    }}
                  />
                </div>
                <span className="text-[8px] text-gray-400">{h}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-3 mt-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-green-500" />在宅率50%+</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-gray-300" />50%未満</span>
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
                  <span className="text-green-600">対面率 {d.visits > 0 ? Math.round(d.contacts / d.visits * 100) : 0}%</span>
                  <span className="text-blue-600">アポ {d.appos}</span>
                  <span className="text-red-600">成約 {d.contracts}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Response Type */}
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">対応者別件数</h2>
        <div className="bg-white rounded-xl shadow-sm p-3 flex gap-3 justify-around">
          {stats.responseStats.map((r) => (
            <div key={r.key} className="text-center">
              <span className="text-2xl">{r.icon}</span>
              <p className="text-xs text-gray-500 mt-0.5">{r.label}</p>
              <p className="text-lg font-bold">{r.count}</p>
            </div>
          ))}
        </div>
      </div>

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

// Past data trends from imported CSV
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
      {/* Overall past stats */}
      <div className="px-4 pb-4">
        <h2 className="text-sm font-bold text-gray-700 mb-2">過去実績（インポート済み {dailyStats.length}日分）</h2>
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
            <div className="flex justify-between">
              <span>接触率</span>
              <span className="font-bold">{totals.visits > 0 ? (totals.contacts / totals.visits * 100).toFixed(1) : 0}%</span>
            </div>
            <div className="flex justify-between">
              <span>対面率</span>
              <span className="font-bold">{totals.visits > 0 ? (totals.faceToFace / totals.visits * 100).toFixed(1) : 0}%</span>
            </div>
            <div className="flex justify-between">
              <span>アポ率（対訪問）</span>
              <span className="font-bold">{totals.visits > 0 ? (totals.appointments / totals.visits * 100).toFixed(2) : 0}%</span>
            </div>
            <div className="flex justify-between">
              <span>成約率（対アポ）</span>
              <span className="font-bold">{totals.appointments > 0 ? (totals.contracts / totals.appointments * 100).toFixed(1) : 0}%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Monthly trend */}
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
                  <div
                    className="h-full rounded-full bg-blue-400"
                    style={{ width: `${(d.visits / maxVisits) * 100}%`, minWidth: '4px' }}
                  />
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
