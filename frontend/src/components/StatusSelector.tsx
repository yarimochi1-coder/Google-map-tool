import type { PropertyStatus } from '../types';
import { STATUS_LIST } from '../lib/statusConfig';

interface StatusSelectorProps {
  currentStatus: PropertyStatus;
  onSelect: (status: PropertyStatus) => void;
}

export function StatusSelector({ currentStatus, onSelect }: StatusSelectorProps) {
  return (
    <div className="grid grid-cols-3 gap-2 p-2">
      {STATUS_LIST.map((s) => {
        const isActive = currentStatus === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onSelect(s.key)}
            className={`
              flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-bold
              min-h-[52px] transition-all active:scale-95
              ${isActive
                ? 'ring-2 ring-offset-1 shadow-md'
                : 'shadow-sm'
              }
            `}
            style={{
              backgroundColor: isActive ? s.color : s.bgColor,
              color: isActive ? '#fff' : s.color,
              outlineColor: isActive ? s.color : undefined,
            }}
          >
            <span className="text-lg">{s.icon}</span>
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </div>
  );
}
