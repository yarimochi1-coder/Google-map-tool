// 車のグレード（訪問先の駐車車両）。値はそのままスプレッドシートに保存される
export const CAR_CLASSES = ['高級車', '普通車', '軽自動車'] as const;

export const CAR_AGE_GROUPS = [
  { key: '新型', label: '新型', color: '#1E88E5' },
  { key: '型落ち', label: '型落ち〜5年', color: '#43A047' },
  { key: 'ボロボロ', label: 'ボロボロ', color: '#8D6E63' },
] as const;

export const CAR_SPECIAL = [
  { value: 'こだわり車', icon: '🏎', color: '#E91E63' },
  { value: '建築用車', icon: '🚚', color: '#F57C00' },
  { value: '車なし', icon: '－', color: '#9E9E9E' },
] as const;

export function carGradeValue(age: string, cls: string): string {
  return `${age}・${cls}`;
}

// 分析の表示順
export const CAR_GRADE_ORDER: string[] = [
  ...CAR_AGE_GROUPS.flatMap((g) => CAR_CLASSES.map((c) => carGradeValue(g.key, c))),
  ...CAR_SPECIAL.map((s) => s.value),
];
