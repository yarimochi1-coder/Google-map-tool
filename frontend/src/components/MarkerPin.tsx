import type { PropertyStatus } from '../types';
import { getStatusConfig } from '../lib/statusConfig';

interface MarkerPinProps {
  status: PropertyStatus;
  name?: string;
}

export function MarkerPin({ status, name }: MarkerPinProps) {
  const config = getStatusConfig(status);

  return (
    <div className="flex flex-col items-center" style={{ transform: 'translate(0, -100%)' }}>
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-lg border-2 border-white"
        style={{ backgroundColor: config.color }}
      >
        {config.icon}
      </div>
      <div
        className="w-0 h-0"
        style={{
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: `8px solid ${config.color}`,
          marginTop: '-1px',
        }}
      />
      {name && (
        <span className="text-[10px] bg-white/90 px-1 rounded mt-0.5 text-gray-800 whitespace-nowrap max-w-[80px] truncate shadow-sm">
          {name}
        </span>
      )}
    </div>
  );
}
