// 2025年9月〜2026年1月の過去実績データ（CSVから抽出）
// このデータは1回限りのインポート。今後はアプリの操作で自動蓄積される。

export interface PastDailyStat {
  date: string;
  visits: number;
  contacts: number;
  faceToFace: number;
  measurements: number;
  appointments: number;
  contracts: number;
  notes: string;
}

export const PAST_DAILY_STATS: PastDailyStat[] = [
  // 2025年9月
  { date: '2025-09-26', visits: 75, contacts: 22, faceToFace: 11, measurements: 1, appointments: 1, contracts: 0, notes: '' },
  { date: '2025-09-28', visits: 28, contacts: 9, faceToFace: 6, measurements: 2, appointments: 2, contracts: 0, notes: '足場周り' },
  // 2025年10月
  { date: '2025-10-02', visits: 338, contacts: 47, faceToFace: 17, measurements: 0, appointments: 0, contracts: 0, notes: '11時〜19時まで稼働' },
  { date: '2025-10-03', visits: 117, contacts: 31, faceToFace: 13, measurements: 0, appointments: 0, contracts: 0, notes: '雨' },
  { date: '2025-10-05', visits: 201, contacts: 44, faceToFace: 12, measurements: 0, appointments: 0, contracts: 0, notes: '雨' },
  { date: '2025-10-11', visits: 110, contacts: 35, faceToFace: 13, measurements: 0, appointments: 0, contracts: 0, notes: '土曜日、近隣学校イベント、午前中' },
  { date: '2025-10-13', visits: 90, contacts: 17, faceToFace: 5, measurements: 0, appointments: 0, contracts: 0, notes: '祝日、昼' },
  { date: '2025-10-16', visits: 52, contacts: 15, faceToFace: 8, measurements: 0, appointments: 0, contracts: 0, notes: '16時〜18時' },
  { date: '2025-10-25', visits: 84, contacts: 17, faceToFace: 10, measurements: 0, appointments: 0, contracts: 0, notes: '雨' },
  // 2025年11月
  { date: '2025-11-24', visits: 0, contacts: 0, faceToFace: 0, measurements: 0, appointments: 0, contracts: 2, notes: '' },
  { date: '2025-11-30', visits: 572, contacts: 160, faceToFace: 61, measurements: 9, appointments: 6, contracts: 0, notes: '' },
  // 2025年12月
  { date: '2025-12-07', visits: 251, contacts: 71, faceToFace: 20, measurements: 1, appointments: 1, contracts: 0, notes: '' },
  { date: '2025-12-08', visits: 26, contacts: 16, faceToFace: 4, measurements: 0, appointments: 0, contracts: 0, notes: '' },
  { date: '2025-12-09', visits: 61, contacts: 21, faceToFace: 4, measurements: 0, appointments: 0, contracts: 0, notes: '' },
  { date: '2025-12-11', visits: 60, contacts: 13, faceToFace: 3, measurements: 0, appointments: 0, contracts: 0, notes: '' },
  { date: '2025-12-13', visits: 77, contacts: 56, faceToFace: 17, measurements: 0, appointments: 0, contracts: 0, notes: '' },
  { date: '2025-12-14', visits: 70, contacts: 26, faceToFace: 10, measurements: 1, appointments: 1, contracts: 0, notes: '' },
  { date: '2025-12-15', visits: 0, contacts: 6, faceToFace: 3, measurements: 2, appointments: 2, contracts: 0, notes: '' },
  { date: '2025-12-21', visits: 0, contacts: 0, faceToFace: 0, measurements: 0, appointments: 0, contracts: 2, notes: '' },
  { date: '2025-12-23', visits: 57, contacts: 17, faceToFace: 5, measurements: 1, appointments: 1, contracts: 0, notes: '' },
  { date: '2025-12-26', visits: 0, contacts: 0, faceToFace: 0, measurements: 0, appointments: 0, contracts: 1, notes: '' },
  // 2026年1月
  { date: '2026-01-05', visits: 74, contacts: 34, faceToFace: 8, measurements: 0, appointments: 0, contracts: 0, notes: '' },
  { date: '2026-01-06', visits: 42, contacts: 11, faceToFace: 1, measurements: 0, appointments: 0, contracts: 0, notes: '' },
];

// 集計済みの過去実績サマリー
export const PAST_TOTALS = {
  visits: 3936,
  contacts: 1020,
  faceToFace: 378,
  measurements: 29,
  appointments: 23,
  contracts: 7,
  // 転換率
  contactRate: 0.259,      // 25.9%
  faceToFaceRate: 0.096,   // 9.6%
  measureToAppoRate: 0.793, // 79.3%
  appoToContractRate: 0.304, // 30.4%
  overallRate: 0.0058,     // 0.58%
};
