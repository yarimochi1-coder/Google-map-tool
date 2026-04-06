import type { Property } from '../types';

export interface DailyStat {
  date: string;
  visits: number;
  contacts: number;
  face_to_face: number;
  measurements: number;
  appointments: number;
  contracts: number;
  notes: string;
}

export function parseDailyStatsCSV(csvString: string): DailyStat[] {
  const lines = csvString.trim().split('\n');
  if (lines.length < 2) return [];

  const results: DailyStat[] = [];
  let currentYear = '2025';

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const dateStr = cols[0];

    if (!dateStr || dateStr === '合計' || dateStr === '目標数値(1日)' || dateStr === '目標数値(一月)' || dateStr === '') continue;

    // Detect month/day format like "9/26" or "10/1"
    const dateMatch = dateStr.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (!dateMatch) continue;

    const month = parseInt(dateMatch[1]);
    const day = parseInt(dateMatch[2]);

    // Handle year rollover (if month goes from 12 to 1)
    if (month === 1 && i > 1) currentYear = '2026';

    const visits = parseInt(cols[1]) || 0;
    const contacts = parseInt(cols[2]) || 0;
    const faceToFace = parseInt(cols[3]) || 0;
    const measurements = parseInt(cols[4]) || 0;
    const appointments = parseInt(cols[5]) || 0;
    const contracts = parseInt(cols[6]) || 0;
    const notes = cols[12] || '';

    // Skip rows with no data
    if (visits === 0 && contacts === 0 && contracts === 0) continue;

    results.push({
      date: `${currentYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      visits,
      contacts,
      face_to_face: faceToFace,
      measurements,
      appointments,
      contracts,
      notes,
    });
  }

  return results;
}

function createBlankProperty(overrides: Partial<Property>): Property {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    lat: 0,
    lng: 0,
    address: '',
    name: '',
    status: 'absent',
    building_age: '',
    deterioration: '',
    photo_url: '',
    memo: '',
    staff: '',
    roof_type: '',
    estimated_area: '',
    contract_amount: '',
    rejection_reason: '',
    revisit: '',
    last_visit_date: '',
    created_at: now,
    updated_at: now,
    user_id: '',
    visit_count: 0,
    ...overrides,
  };
}

export function parseKML(xmlString: string): Property[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');
  const placemarks = doc.querySelectorAll('Placemark');
  const properties: Property[] = [];

  placemarks.forEach((pm) => {
    const nameEl = pm.querySelector('name');
    const coordsEl = pm.querySelector('coordinates');
    const descEl = pm.querySelector('description');

    if (!coordsEl) return;

    const coordText = coordsEl.textContent?.trim() ?? '';
    const [lngStr, latStr] = coordText.split(',');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    if (isNaN(lat) || isNaN(lng)) return;

    properties.push(
      createBlankProperty({
        lat,
        lng,
        name: nameEl?.textContent?.trim() ?? '',
        memo: descEl?.textContent?.trim() ?? '',
      })
    );
  });

  return properties;
}

export function parseCSV(csvString: string): Property[] {
  const lines = csvString.trim().split('\n');
  if (lines.length < 2) return [];

  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const properties: Property[] = [];

  const colMap: Record<string, string[]> = {
    name: ['name', '名前', '氏名'],
    address: ['address', '住所'],
    lat: ['lat', '緯度', 'latitude'],
    lng: ['lng', '経度', 'longitude', 'lon'],
    memo: ['memo', 'メモ', 'description', '備考'],
    status: ['status', 'ステータス'],
  };

  function findCol(key: string): number {
    const aliases = colMap[key] ?? [key];
    return headers.findIndex((h) => aliases.includes(h));
  }

  const nameIdx = findCol('name');
  const addressIdx = findCol('address');
  const latIdx = findCol('lat');
  const lngIdx = findCol('lng');
  const memoIdx = findCol('memo');

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim());
    const lat = latIdx >= 0 ? parseFloat(cols[latIdx]) : NaN;
    const lng = lngIdx >= 0 ? parseFloat(cols[lngIdx]) : NaN;

    if (isNaN(lat) || isNaN(lng)) continue;

    properties.push(
      createBlankProperty({
        lat,
        lng,
        name: nameIdx >= 0 ? cols[nameIdx] : '',
        address: addressIdx >= 0 ? cols[addressIdx] : '',
        memo: memoIdx >= 0 ? cols[memoIdx] : '',
      })
    );
  }

  return properties;
}
