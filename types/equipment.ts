/**
 * Equipment Types
 *
 * Maps to `equipment` table and related tracking.
 */

export type EquipmentType = 'tool' | 'blade' | 'vehicle' | 'safety' | 'other';
export type EquipmentStatus = 'available' | 'in_use' | 'assigned' | 'maintenance' | 'retired';
export type BladeType = 'wall_saw' | 'hand_saw' | 'slab_saw' | 'chainsaw' | 'core_bit';

export interface Equipment {
  id: string;
  name: string;
  type: EquipmentType;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  qr_code: string | null;
  status: EquipmentStatus;
  assigned_to: string | null;
  assigned_at: string | null;
  location: string | null;
  purchase_date: string | null;
  purchase_cost: number | null;
  total_usage_hours: number | null;
  last_used_at: string | null;
  notes: string | null;
  qr_image: string | null;
  created_at: string;
  updated_at: string;
}

export interface Blade {
  id: string;
  type: BladeType;
  brand_name: string;
  size: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost: number | null;
  status: 'active' | 'retired';
  total_linear_feet: number | null;
  total_inches: number | null;
  holes_count: number | null;
  assigned_to: string | null;
  retired_at: string | null;
  retirement_reason: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
