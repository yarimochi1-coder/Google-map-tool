interface SyncIndicatorProps {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
}

export function SyncIndicator({ isOnline, isSyncing, pendingCount }: SyncIndicatorProps) {
  if (isOnline && pendingCount === 0 && !isSyncing) return null;

  return (
    <div className="absolute top-16 right-3 z-40">
      <div
        className={`
          flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold shadow-lg
          ${!isOnline
            ? 'bg-red-500 text-white'
            : isSyncing
            ? 'bg-yellow-400 text-yellow-900'
            : pendingCount > 0
            ? 'bg-orange-400 text-white'
            : 'bg-green-500 text-white'
          }
        `}
      >
        <span
          className={`w-2 h-2 rounded-full ${
            !isOnline ? 'bg-red-200' : isSyncing ? 'bg-yellow-200 animate-pulse' : 'bg-orange-200'
          }`}
        />
        {!isOnline
          ? 'オフライン'
          : isSyncing
          ? '同期中...'
          : `未同期: ${pendingCount}件`}
      </div>
    </div>
  );
}
