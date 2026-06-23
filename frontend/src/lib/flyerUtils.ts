// チラシ配布データのパース/シリアライズ
// 各チラシに個別の配布日時を保持する
//
// 保存形式（flyer_name フィールド内）:
//   JSON配列: [{"name":"春チラシ","date":"2026/4/15 10:00"},...]
//
// 後方互換: JSONでない場合は、flyer_name=カンマ区切り名前、flyer_distributed=全体の日時 とみなす

export interface FlyerEntry {
  name: string;
  date: string; // 配布日時（"YYYY/M/D HH:mm:ss" 形式または同等）
}

export function parseFlyers(flyerNameRaw: any, flyerDistributedRaw: any): FlyerEntry[] {
  const rawStr = String(flyerNameRaw || '').trim();
  if (!rawStr) return [];

  // JSON配列形式を試す
  try {
    const arr = JSON.parse(rawStr);
    if (Array.isArray(arr)) {
      return arr
        .map((e) => ({
          name: String(e?.name || '').trim(),
          date: String(e?.date || '').trim(),
        }))
        .filter((e) => e.name.length > 0);
    }
  } catch {
    // JSON でない場合はカンマ区切りとして処理
  }

  // 後方互換: カンマ区切り + 全体の日時
  const fallbackDate = String(flyerDistributedRaw || '').trim();
  return rawStr
    .split(',')
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map((name) => ({ name, date: fallbackDate }));
}

export function serializeFlyers(entries: FlyerEntry[]): { flyer_name: string; flyer_distributed: string } {
  const filtered = entries.filter((e) => e.name && e.name.trim().length > 0);
  if (filtered.length === 0) {
    return { flyer_name: '', flyer_distributed: '' };
  }
  // 最新の日時を summary としても保持（ダッシュボード等の旧コード互換用）
  const latest = filtered.reduce((acc, e) => (e.date > acc ? e.date : acc), '');
  return {
    flyer_name: JSON.stringify(filtered),
    flyer_distributed: latest,
  };
}

export function flyerNamesDisplay(entries: FlyerEntry[]): string {
  return entries.map((e) => e.name).join(', ');
}
