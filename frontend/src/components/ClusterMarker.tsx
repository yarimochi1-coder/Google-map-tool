import type { Property } from '../types';

interface ClusterMarkerProps {
  properties: Property[];
  zoom: number;
  onClick: () => void;
}

export function ClusterMarker({ properties, zoom, onClick }: ClusterMarkerProps) {
  const absent = properties.filter((p) => p.status === 'absent').length;
  const interphone = properties.filter((p) => p.status === 'interphone').length;
  const child = properties.filter((p) => p.status === 'child').length;
  const grandfather = properties.filter((p) => p.status === 'grandfather').length;
  const grandmother = properties.filter((p) => p.status === 'grandmother').length;
  const total = properties.length;

  // Latest visit date
  const lastVisit = properties
    .map((p) => p.last_visit_date)
    .filter(Boolean)
    .sort()
    .pop();

  const shortDate = lastVisit
    ? lastVisit.split(' ')[0].replace(/^\d{4}\//, '')
    : '';

  const rows = [
    { label: '不在', count: absent, color: '#9E9E9E' },
    { label: 'イ', count: interphone, color: '#FF9800' },
    { label: '👦', count: child, color: '#FF9800' },
    { label: '👴', count: grandfather, color: '#795548' },
    { label: '👵', count: grandmother, color: '#E91E63' },
  ].filter((r) => r.count > 0);

  // Scale and detail based on zoom level
  const isFar = zoom <= 10;
  const isMid = zoom > 10 && zoom <= 13;

  // Far out (prefecture/city): big simple circle
  if (isFar) {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="cursor-pointer active:scale-95 transition-transform flex items-center justify-center"
        style={{ transform: 'translate(0, -50%)' }}
      >
        <div
          className="rounded-full flex flex-col items-center justify-center shadow-lg border-3 border-white text-white font-black"
          style={{
            width: `${Math.min(36 + total * 2, 80)}px`,
            height: `${Math.min(36 + total * 2, 80)}px`,
            backgroundColor: 'rgba(33, 150, 243, 0.85)',
            fontSize: total >= 100 ? '16px' : '18px',
          }}
        >
          <span>{total}</span>
          <span className="text-[8px] font-bold opacity-80">件</span>
        </div>
      </div>
    );
  }

  // Mid range (ward/town): card with total + breakdown
  if (isMid) {
    return (
      <div
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className="bg-white rounded-xl shadow-lg border border-gray-200 px-2 py-1.5 cursor-pointer active:scale-95 transition-transform"
        style={{ transform: 'translate(0, -50%)', minWidth: '60px' }}
      >
        <div className="text-center font-black text-lg text-blue-600 leading-tight">
          {total}
        </div>
        <div className="flex flex-wrap gap-x-1.5 justify-center">
          {rows.slice(0, 3).map((r) => (
            <span key={r.label} className="text-[9px] font-bold" style={{ color: r.color }}>
              {r.label}{r.count}
            </span>
          ))}
        </div>
        {shortDate && (
          <div className="text-[8px] text-gray-400 text-center mt-0.5">{shortDate}</div>
        )}
        <div className="flex justify-center">
          <div className="w-0 h-0" style={{
            borderLeft: '5px solid transparent',
            borderRight: '5px solid transparent',
            borderTop: '5px solid white',
          }} />
        </div>
      </div>
    );
  }

  // Close range (neighborhood): detailed card
  return (
    <div
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      className="bg-white rounded-xl shadow-lg border border-gray-200 px-2.5 py-1.5 cursor-pointer active:scale-95 transition-transform"
      style={{ transform: 'translate(0, -50%)', minWidth: '70px' }}
    >
      <div className="text-center font-black text-lg text-blue-600 leading-tight">
        {total}
      </div>
      <div className="flex flex-wrap gap-x-2 gap-y-0 justify-center">
        {rows.map((r) => (
          <span key={r.label} className="text-[10px] font-bold whitespace-nowrap" style={{ color: r.color }}>
            {r.label}{r.count}
          </span>
        ))}
      </div>
      {shortDate && (
        <div className="text-[9px] text-gray-400 text-center mt-0.5 leading-tight">{shortDate}</div>
      )}
      <div className="flex justify-center">
        <div className="w-0 h-0" style={{
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderTop: '6px solid white',
        }} />
      </div>
    </div>
  );
}
