/**
 * Pontifex Industries - Database Helper Functions
 * Complete CRUD operations for all tables
 */

import { supabase } from './supabase';

// =====================================================
// TYPES (matching database schema)
// =====================================================

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: 'admin' | 'operator';
  phone?: string;
  created_at?: string;
  updated_at?: string;
  active?: boolean;
}

export interface Equipment {
  id?: string;
  name: string;
  type: 'tool' | 'blade' | 'vehicle' | 'safety' | 'other';
  brand?: string;
  model?: string;
  serial_number: string;
  qr_code?: string;
  status: 'available' | 'in_use' | 'maintenance' | 'retired';
  assigned_to?: string;
  assigned_at?: string;
  location?: string;
  purchase_date?: string;
  purchase_cost?: number;
  total_usage_hours?: number;
  last_used_at?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

// NOTE: The legacy 'Job' interface and 'jobs' table CRUD functions have been removed.
// The active job system uses the 'job_orders' table — see types/job.ts for the JobOrder type.

export interface Blade {
  id?: string;
  type: 'wall_saw' | 'hand_saw' | 'slab_saw' | 'chainsaw' | 'core_bit';
  brand_name: string;
  size: string;
  serial_number: string;
  purchase_date: string;
  purchase_cost?: number;
  status: 'active' | 'retired';
  total_linear_feet?: number;
  total_inches?: number;
  holes_count?: number;
  assigned_to?: string;
  retired_at?: string;
  retirement_reason?: string;
  retirement_photo_url?: string;
  notes?: string;
  created_at?: string;
  updated_at?: string;
}

export interface AccessRequest {
  id?: string;
  full_name: string;
  email: string;
  password_hash?: string;
  date_of_birth: string;
  position: string;
  status: 'pending' | 'approved' | 'denied';
  reviewed_by?: string;
  reviewed_at?: string;
  assigned_role?: 'admin' | 'operator';
  denial_reason?: string;
  created_at?: string;
  updated_at?: string;
}

// =====================================================
// USER/PROFILE FUNCTIONS
// =====================================================

export async function getCurrentUserProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (error) {
    console.error('Error fetching profile:', error);
    return null;
  }

  return data;
}

export async function getAllOperators(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('role', 'operator')
    .eq('active', true)
    .order('full_name');

  if (error) {
    console.error('Error fetching operators:', error);
    return [];
  }

  return data || [];
}

export async function getAllProfiles(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .order('full_name');

  if (error) {
    console.error('Error fetching profiles:', error);
    return [];
  }

  return data || [];
}

// =====================================================
// EQUIPMENT FUNCTIONS
// =====================================================

export async function getAllEquipment(): Promise<Equipment[]> {
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .order('name');

  if (error) {
    console.error('Error fetching equipment:', error);
    return [];
  }

  return data || [];
}

export async function getEquipmentById(id: string): Promise<Equipment | null> {
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching equipment:', error);
    return null;
  }

  return data;
}

export async function getEquipmentByQRCode(qrCode: string): Promise<Equipment | null> {
  const { data, error } = await supabase
    .from('equipment')
    .select('*')
    .eq('qr_code', qrCode)
    .single();

  if (error) {
    console.error('Error fetching equipment by QR:', error);
    return null;
  }

  return data;
}

export async function createEquipment(equipment: Equipment) {
  const { data, error } = await supabase
    .from('equipment')
    .insert([equipment])
    .select()
    .single();

  if (error) {
    console.error('Error creating equipment:', error);
    throw error;
  }

  return data;
}

export async function updateEquipment(id: string, updates: Partial<Equipment>) {
  const { data, error } = await supabase
    .from('equipment')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating equipment:', error);
    throw error;
  }

  return data;
}

export async function deleteEquipment(id: string) {
  const { error } = await supabase
    .from('equipment')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting equipment:', error);
    throw error;
  }
}

export async function assignEquipment(equipmentId: string, operatorId: string | null) {
  const updates: Partial<Equipment> = {
    assigned_to: operatorId || undefined,
    assigned_at: operatorId ? new Date().toISOString() : undefined,
    status: operatorId ? 'in_use' : 'available'
  };

  return updateEquipment(equipmentId, updates);
}

// Legacy 'jobs' table CRUD functions removed — use job_orders API routes instead.

// =====================================================
// BLADE FUNCTIONS
// =====================================================

export async function getAllBlades(): Promise<Blade[]> {
  const { data, error } = await supabase
    .from('blades')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching blades:', error);
    return [];
  }

  return data || [];
}

export async function getActiveBlades(): Promise<Blade[]> {
  const { data, error } = await supabase
    .from('blades')
    .select('*')
    .eq('status', 'active')
    .order('brand_name');

  if (error) {
    console.error('Error fetching active blades:', error);
    return [];
  }

  return data || [];
}

export async function createBlade(blade: Blade) {
  const { data, error } = await supabase
    .from('blades')
    .insert([blade])
    .select()
    .single();

  if (error) {
    console.error('Error creating blade:', error);
    throw error;
  }

  return data;
}

export async function updateBlade(id: string, updates: Partial<Blade>) {
  const { data, error } = await supabase
    .from('blades')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating blade:', error);
    throw error;
  }

  return data;
}

export async function retireBlade(id: string, reason: string, photoUrl?: string) {
  const updates: Partial<Blade> = {
    status: 'retired',
    retired_at: new Date().toISOString(),
    retirement_reason: reason,
    retirement_photo_url: photoUrl
  };

  return updateBlade(id, updates);
}

// =====================================================
// ANALYTICS FUNCTIONS
// =====================================================

export async function getDailyAnalytics(date?: string) {
  const targetDate = date || new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('analytics_daily')
    .select('*')
    .eq('date', targetDate)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error fetching daily analytics:', error);
    return null;
  }

  return data;
}

export async function getOperatorPerformance(operatorId?: string) {
  let query = supabase.from('operator_performance').select('*');

  if (operatorId) {
    query = query.eq('operator_id', operatorId);
  }

  const { data, error } = await supabase
    .from('operator_performance')
    .select('*')
    .order('total_revenue_generated', { ascending: false });

  if (error) {
    console.error('Error fetching operator performance:', error);
    return [];
  }

  return data || [];
}

// =====================================================
// FILE UPLOAD FUNCTIONS
// =====================================================

export async function uploadJobPhoto(jobId: string, file: File) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${jobId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('job-photos')
    .upload(fileName, file);

  if (error) {
    console.error('Error uploading photo:', error);
    throw error;
  }

  // Get public URL
  const { data: { publicUrl } } = supabase.storage
    .from('job-photos')
    .getPublicUrl(fileName);

  return publicUrl;
}

export async function uploadEquipmentPhoto(equipmentId: string, file: File) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${equipmentId}/${Date.now()}.${fileExt}`;

  const { data, error } = await supabase.storage
    .from('equipment-photos')
    .upload(fileName, file);

  if (error) {
    console.error('Error uploading equipment photo:', error);
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('equipment-photos')
    .getPublicUrl(fileName);

  return publicUrl;
}

// =====================================================
// REAL-TIME SUBSCRIPTIONS
// =====================================================

// Legacy subscribeToJobs removed — 'jobs' table dropped. Use job_orders subscriptions.

export function subscribeToEquipment(callback: (payload: any) => void) {
  return supabase
    .channel('equipment-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'equipment' }, callback)
    .subscribe();
}

// =====================================================
// ACCESS REQUEST FUNCTIONS
// =====================================================

export async function getAllAccessRequests(): Promise<AccessRequest[]> {
  const { data, error } = await supabase
    .from('access_requests')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching access requests:', error);
    return [];
  }

  return data || [];
}

export async function getAccessRequestsByStatus(status: AccessRequest['status']): Promise<AccessRequest[]> {
  const { data, error } = await supabase
    .from('access_requests')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching access requests by status:', error);
    return [];
  }

  return data || [];
}

export async function getAccessRequestById(id: string): Promise<AccessRequest | null> {
  const { data, error } = await supabase
    .from('access_requests')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching access request:', error);
    return null;
  }

  return data;
}
