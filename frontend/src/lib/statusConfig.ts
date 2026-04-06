import type { StatusConfig, PropertyStatus } from '../types';

export const STATUS_LIST: StatusConfig[] = [
  { key: 'absent', label: '不在', shortLabel: '不在', color: '#9E9E9E', bgColor: '#F5F5F5', icon: '—' },
  { key: 'interphone', label: 'インターホン', shortLabel: 'イ', color: '#FF9800', bgColor: '#FFF3E0', icon: 'イ' },
  { key: 'child', label: '子供対応', shortLabel: 'C', color: '#FF9800', bgColor: '#FFF3E0', icon: '👦' },
  { key: 'grandmother', label: 'おばあさん', shortLabel: 'GM', color: '#E91E63', bgColor: '#FCE4EC', icon: '👵' },
  { key: 'grandfather', label: 'おじいさん', shortLabel: 'GF', color: '#795548', bgColor: '#EFEBE9', icon: '👴' },
  { key: 'ng', label: '話し込み', shortLabel: '話', color: '#4CAF50', bgColor: '#E8F5E9', icon: '💬' },
  { key: 'instant_return', label: '対面即戻り', shortLabel: '即', color: '#FF5722', bgColor: '#FBE9E7', icon: '🔙' },
  { key: 'completed', label: '施工済み', shortLabel: '★', color: '#FFD700', bgColor: '#FFFDE7', icon: '⭐' },
  { key: 'measured', label: '計測済み', shortLabel: '計', color: '#9C27B0', bgColor: '#F3E5F5', icon: '📐' },
  { key: 'appointment', label: 'アポ獲得', shortLabel: 'アポ', color: '#2196F3', bgColor: '#E3F2FD', icon: '📅' },
  { key: 'contract', label: '成約', shortLabel: '約', color: '#F44336', bgColor: '#FFEBEE', icon: '🤝' },
  { key: 'impossible', label: '絶対無理', shortLabel: '×', color: '#F44336', bgColor: '#FFEBEE', icon: '🚫' },
];

export const STATUS_MAP: Record<PropertyStatus, StatusConfig> = Object.fromEntries(
  STATUS_LIST.map((s) => [s.key, s])
) as Record<PropertyStatus, StatusConfig>;

export const getStatusConfig = (status: PropertyStatus): StatusConfig => {
  return STATUS_MAP[status] ?? STATUS_LIST[0];
};
