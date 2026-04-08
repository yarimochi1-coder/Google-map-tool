import { useState, useMemo } from 'react';
import type { Property } from '../types';
import { STATUS_LIST, getStatusConfig } from '../lib/statusConfig';

interface DashboardProps {
  properties: Property[];
  onClose: () => void;
}

type Period = 'day' | 'week' | 'month';

function getDateRange(baseDate: string, period: Period): { start: string; end: string; label: string } {
  const d = new Date(baseDate);

  if (period === 'day') {
    const dateStr = d.toISOString().split('T')[0];
    return {
      start: dateStr,
      end: dateStr,
      label: `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`,
    };
  }

  if (period === 'week') {
    const day = d.getDay();
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((day + 6) % 7));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    return {
      start: monday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
      label: `${monday.getMonth() + 1}/${monday.getDate()} 〜 ${sunday.getMonth() + 1}/${sunday.getDate()}`,
    };
  }

  // month
  const year = d.getFullYear();
  const month = d.getMonth();
  const start = new Date(year, month, 1);
  const end = new Date(year, month + 1, 0);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
    label: `${year}年${month + 1}月`,
  };
}

function navigateDate(baseDate: string, period: Period, direction: number): string {
  const d = new Date(baseDate);
  if (period === 'day') d.setDate(d.getDate() + direction);
  else if (period === 'week') d.setDate(d.getDate() + direction * 7);
  else d.setMonth(d.getMonth() + direction);
  return d.toISOString().split('T')[0];
}

function isDateInRange(dateStr: any, start: string, end: string): boolean {
  if (!dateStr) return false;
  let padded: string | null = null;
  // Date object (GAS returns Date for date-formatted cells)
  if (dateStr instanceof Date && !isNaN(dateStr.getTime())) {
    padded = `${dateStr.getFullYear()}-${String(dateStr.getMonth() + 1).padStart(2, '0')}-${String(dateStr.getDate()).padStart(2, '0')}`;
  } else if (typeof dateStr === 'string') {
    const datePart = dateStr.split(' ')[0].split('T')[0].replace(/\//g, '-');
    const m = datePart.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (m) {
      padded = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    } else {
      // Fallback: native Date parse
      const d = new Date(dateStr);
      if (!isNaN(d.getTime())) {
        padded = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      }
    }
  }
  if (!padded) return false;
  return padded >= start && padded <= end;
}

export function Dashboard({ properties, onClose }: DashboardProps) {
  const [period, setPeriod] = useState<Period>('day');
  const [baseDate, setBaseDate] = useState(
    new Date().toISOString().split('T')[0]
  );

  const range = useMemo(() => getDateRange(baseDate, period), [baseDate, period]);

  const stats = useMemo(() => {
    // Exclude '施工済み' and '成約' from visit counts
    const visitProps = properties.filter((p) => p.status !== 'completed' && p.status !== 'contract');
    // 訪問日 (last_visit_date) が空ならピン作成日 (created_at) を訪問日として扱う
    const periodVisits = visitProps.filter((p) => {
      const dateRef = p.last_visit_date || p.created_at;
      return isDateInRange(dateRef, range.start, range.end);
    });
    const periodCreated = visitProps.filter((p) =>
      isDateInRange(p.created_at, range.start, range.end)
    );

    const statusCounts = STATUS_LIST.map((s) => ({
      ...s,
      count: properties.filter((p) => p.status === s.key).length,
      periodCount: periodVisits.filter((p) => p.status === s.key).length,
    }));

    // 期間内訪問のステータス内訳（その日詳細用）
    const periodStatusBreakdown = STATUS_LIST.map((s) => ({
      ...s,
      count: periodVisits.filter((p) => p.status === s.key).length,
    })).filter((s) => s.count > 0);

    const totalPins = properties.length;
    const maxCount = Math.max(...statusCounts.map((s) => s.count), 1);

    // Staff breakdown for the period
    const staffMap: Record<string, number> = {};
    for (const p of periodVisits) {
      const name = p.staff || '未設定';
      staffMap[name] = (staffMap[name] || 0) + 1;
    }
    const staffBreakdown = Object.entries(staffMap)
      .sort((a, b) => b[1] - a[1]);

    // 成約とアポはperiod内で別途集計（visitPropsには含まれていない）
    const periodAppos = properties.filter((p) => p.status === 'appointment' && isDateInRange(p.last_visit_date, range.start, range.end)).length;
    const periodContracts = properties.filter((p) => p.status === 'contract' && isDateInRange(p.last_visit_date, range.start, range.end)).length;

    return {
      periodVisits: periodVisits.length,
      periodCreated: periodCreated.length,
      appointments: periodAppos,
      contracts: periodContracts,
      statusCounts,
      periodStatusBreakdown,
      totalPins,
      maxCount,
      staffBreakdown,
    };
  }, [properties, range]);

  const periodLabels: Record<Period, string> = { day: '日', week: '週', month: '月' };

  return (
    <div className="absolute inset-0 bg-gray-50 overflow-y-auto pb-16">
      {/* Header */}
      <div className="bg-white shadow-sm sticky top-0 z-10">
        <div className="flex items-center justify-between px-4 py-3">
          <h1 className="text-lg font-bold">ダッシュボード</h1>
          <button
            onClick={() => {
              const visitProps = properties.filter((p) => p.status !== 'completed' && p.status !== 'contract');
              const sample = visitProps.slice(0, 5).map((p) => ({
                name: p.name,
                status: p.status,
                last_visit_date: p.last_visit_date,
                created_at: p.created_at,
                created_at_type: typeof p.created_at,
              }));
              alert(
                `range: ${range.start} 〜 ${range.end}\n` +
                `visitProps: ${visitProps.length}\n` +
                `periodVisits: ${stats.periodVisits}\n\n` +
                `sample:\n${JSON.stringify(sample, null, 2)}`
              );
            }}
            className="px-3 py-1 mr-2 rounded-lg bg-yellow-300 text-xs font-bold"
          >
            DEBUG
          </button>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-gray-600 text-xl"
          >
            ×
          </button>
        </div>

        {/* Period tabs */}
        <div className="flex gap-1 px-4 pb-2">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${
                period === p
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-100 text-gray-500'
              }`}
            >
              {periodLabels[p]}
            </button>
          ))}
        </div>

        {/* Date navigation */}
        <div className="flex items-center justify-center gap-4 pb-3">
          <button
            onClick={() => setBaseDate(navigateDate(baseDate, period, -1))}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-lg"
          >
            ←
          </button>
          <span className="font-bold text-base min-w-[160px] text-center">
            {range.label}
          </span>
          <button
            onClick={() => setBaseDate(navigateDate(baseDate, period, 1))}
            className="w-10 h-10 flex items-center justify-center rounded-full bg-gray-100 text-lg"
          >
            →
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 p-4">
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-500">訪問数</p>
          <p className="text-3xl font-bold text-blue-600">{stats.periodVisits}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-500">新規ピン</p>
          <p className="text-3xl font-bold text-green-600">{stats.periodCreated}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-500">アポ獲得</p>
          <p className="text-3xl font-bold text-yellow-600">{stats.appointments}</p>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm">
          <p className="text-xs text-gray-500">成約</p>
          <p className="text-3xl font-bold text-red-600">{stats.contracts}</p>
        </div>
      </div>

      {/* Period visits status breakdown */}
      {stats.periodStatusBreakdown.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">この期間の訪問内訳</h2>
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {stats.periodStatusBreakdown.map((s) => (
              <div key={s.key} className="flex justify-between items-center px-4 py-2.5">
                <span className="text-sm font-bold" style={{ color: s.color }}>
                  {s.icon} {s.label}
                </span>
                <span className="text-sm font-bold text-gray-700">{s.count}件</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Staff breakdown */}
      {stats.staffBreakdown.length > 0 && (
        <div className="px-4 pb-4">
          <h2 className="text-sm font-bold text-gray-700 mb-2">担当者別</h2>
          <div className="bg-white rounded-xl shadow-sm divide-y">
            {stats.staffBreakdown.map(([name, count]) => (
              <div key={name} className="flex justify-between px-4 py-2.5">
                <span className="text-sm font-bold text-gray-700">{name}</span>
                <span className="text-sm text-blue-600 font-bold">{count}件</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Total */}
      <div className="px-4 pb-2">
        <p className="text-sm text-gray-500">
          全ピン数: <span className="font-bold text-gray-800">{stats.totalPins}</span>
        </p>
      </div>

      {/* Status breakdown */}
      <div className="px-4 pb-8">
        <h2 className="text-sm font-bold text-gray-700 mb-3">ステータス内訳（全期間）</h2>
        <div className="space-y-2">
          {stats.statusCounts.map((s) => {
            const config = getStatusConfig(s.key);
            const widthPercent = (s.count / stats.maxCount) * 100;
            return (
              <div key={s.key} className="flex items-center gap-2">
                <span className="w-20 text-xs font-bold truncate" style={{ color: config.color }}>
                  {config.icon} {config.label}
                </span>
                <div className="flex-1 h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${widthPercent}%`,
                      backgroundColor: config.color,
                      minWidth: s.count > 0 ? '8px' : '0',
                    }}
                  />
                </div>
                <span className="w-8 text-xs text-right font-bold text-gray-700">
                  {s.count}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
