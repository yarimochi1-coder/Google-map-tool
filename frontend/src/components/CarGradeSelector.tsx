import { CAR_AGE_GROUPS, CAR_CLASSES, CAR_SPECIAL, carGradeValue } from '../lib/carGrade';

interface CarGradeSelectorProps {
  value: string;
  onChange: (value: string) => void; // 選択中を再タップで '' （解除）
}

export function CarGradeSelector({ value, onChange }: CarGradeSelectorProps) {
  const pick = (v: string) => onChange(value === v ? '' : v);

  const btn = (v: string, label: string, color: string) => {
    const active = value === v;
    return (
      <button
        key={v}
        onClick={() => pick(v)}
        className={`flex-1 min-h-[40px] rounded-lg text-xs font-bold transition-all active:scale-95 ${
          active ? 'shadow-md ring-2 ring-offset-1' : ''
        }`}
        style={{
          backgroundColor: active ? color : color + '14',
          color: active ? '#fff' : color,
          border: `1px solid ${active ? color : color + '55'}`,
        }}
      >
        {label}
      </button>
    );
  };

  return (
    <div className="space-y-1.5">
      {CAR_AGE_GROUPS.map((g) => (
        <div key={g.key} className="flex items-center gap-1.5">
          <span className="w-16 shrink-0 text-[10px] font-bold text-gray-500">{g.label}</span>
          {CAR_CLASSES.map((c) => btn(carGradeValue(g.key, c), c, g.color))}
        </div>
      ))}
      <div className="flex items-center gap-1.5">
        <span className="w-16 shrink-0 text-[10px] font-bold text-gray-500">その他</span>
        {CAR_SPECIAL.map((s) => btn(s.value, `${s.icon} ${s.value}`, s.color))}
      </div>
    </div>
  );
}
