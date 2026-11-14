// 日本の祝日（振替休日・国民の休日を含む）と、祝日を含む連休の判定
// 現行の祝日法（2020年以降）の決まりで計算する。2020・2021年の五輪による祝日の移動は扱わない

export type DayType = 'weekday' | 'sat' | 'sun' | 'holiday';

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  weekday: '平日',
  sat: '土曜',
  sun: '日曜',
  holiday: '祝日・連休',
};

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

// m月の第n月曜日（日にち）
function nthMonday(y: number, m: number, n: number): number {
  const firstDow = new Date(y, m - 1, 1).getDay();
  return 1 + ((8 - firstDow) % 7) + (n - 1) * 7;
}

// 春分・秋分の日（1980〜2099年で使える近似式）
function vernalEquinox(y: number): number {
  return Math.floor(20.8431 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

function autumnalEquinox(y: number): number {
  return Math.floor(23.2488 + 0.242194 * (y - 1980) - Math.floor((y - 1980) / 4));
}

// 「国民の祝日」そのもの（振替休日・国民の休日は含まない）
function isNationalHoliday(d: Date): boolean {
  const y = d.getFullYear();
  const day = d.getDate();
  switch (d.getMonth() + 1) {
    case 1: return day === 1 || day === nthMonday(y, 1, 2);
    case 2: return day === 11 || day === 23;
    case 3: return day === vernalEquinox(y);
    case 4: return day === 29;
    case 5: return day >= 3 && day <= 5;
    case 7: return day === nthMonday(y, 7, 3);
    case 8: return day === 11;
    case 9: return day === nthMonday(y, 9, 3) || day === autumnalEquinox(y);
    case 10: return day === nthMonday(y, 10, 2);
    case 11: return day === 3 || day === 23;
    default: return false;
  }
}

export function isHoliday(d: Date): boolean {
  if (isNationalHoliday(d)) return true;
  // 振替休日: 日曜の祝日から祝日が続いた、その次の日
  for (let p = addDays(d, -1); isNationalHoliday(p); p = addDays(p, -1)) {
    if (p.getDay() === 0) return true;
  }
  // 国民の休日: 前日と翌日が祝日の日
  return isNationalHoliday(addDays(d, -1)) && isNationalHoliday(addDays(d, 1));
}

// 年末年始（12/29〜1/3）は祝日ではないが、休みの家庭が多いので連休として扱う
function isYearEndBreak(d: Date): boolean {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return (m === 12 && day >= 29) || (m === 1 && day <= 3);
}

function isOffDay(d: Date): boolean {
  const dow = d.getDay();
  return dow === 0 || dow === 6 || isHoliday(d) || isYearEndBreak(d);
}

// 祝日・年末年始と、それにつながって3日以上の休みになる土日を「祝日・連休」にまとめる
export function getDayType(d: Date): DayType {
  if (isHoliday(d) || isYearEndBreak(d)) return 'holiday';
  const dow = d.getDay();
  if (dow !== 0 && dow !== 6) return 'weekday';
  let start = d;
  let end = d;
  while (isOffDay(addDays(start, -1))) start = addDays(start, -1);
  while (isOffDay(addDays(end, 1))) end = addDays(end, 1);
  const length = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  // 土日だけなら休みは2日まで。3日以上なら祝日を含む連休
  if (length >= 3) return 'holiday';
  return dow === 6 ? 'sat' : 'sun';
}
