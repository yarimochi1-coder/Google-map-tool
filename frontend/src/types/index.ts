export type PropertyStatus =
  | 'absent'
  | 'interphone'
  | 'child'
  | 'grandmother'
  | 'grandfather'
  | 'ng'
  | 'instant_return'
  | 'measured'
  | 'appointment'
  | 'contract'
  | 'completed'
  | 'impossible';

export interface VisitRecord {
  id: string;
  property_id: string;
  status: PropertyStatus;
  staff: string;
  visited_at: string;
  memo: string;
}

export interface Property {
  id: string;
  lat: number;
  lng: number;
  address: string;
  name: string;
  status: PropertyStatus;
  building_age: string;
  deterioration: string;
  photo_url: string;
  memo: string;
  staff: string;
  roof_type: string;
  estimated_area: string;
  contract_amount: string;
  rejection_reason: string;
  last_visit_date: string;
  created_at: string;
  updated_at: string;
  user_id: string;
  visit_count: number;
  revisit: string; // '' or ISO date when flagged for revisit
}

export type MarkerLayer = 'visit' | 'our_work' | 'target';

export interface LayerPin {
  id: string;
  lat: number;
  lng: number;
  name: string;
  address: string;
  memo: string;
  layer: MarkerLayer;
  created_at: string;
}

export interface MonthlyGoal {
  month: string; // YYYY-MM
  targetContracts: number;
  targetAppointments: number;
  targetVisits: number;
}

export interface SyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete' | 'log_visit';
  data: Partial<Property> & { id: string };
  timestamp: number;
  retryCount: number;
}

export interface StatusConfig {
  key: PropertyStatus;
  label: string;
  shortLabel: string;
  color: string;
  bgColor: string;
  icon: string;
}
