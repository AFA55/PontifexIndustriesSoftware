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

export interface Job {
  id?: string;
  job_number?: string;
  title: string;
  customer_name: string;
  project_name?: string;
  location: string;
  address?: string;
  status: 'scheduled' | 'in_route' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  scheduled_start_date: string;
  scheduled_end_date?: string;
  scheduled_arrival_time?: string;
  estimated_hours?: number;
  actual_start_time?: string;
  actual_end_time?: string;
  actual_hours_worked?: number;
  assigned_operators?: string[];
  salesman?: string;
  job_types?: string[];
  description?: string;
  additional_info?: string;
  contact_on_site?: string;
  contact_phone?: string;
  job_site_number?: string;
  po_number?: string;
  customer_job_number?: string;
  job_quote?: number;
  total_revenue?: number;
  labor_cost?: number;
  material_cost?: number;
  equipment_cost?: number;
  linear_feet_cut?: number;
  square_feet_completed?: number;
  holes_drilled?: number;
  required_documents?: string[];
  equipment_assigned?: string[];
  progress_percentage?: number;
  photo_urls?: string[];
  document_urls?: string[];
  notes?: string;
  completion_notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
  completed_at?: string;
}

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

// =====================================================
// JOB FUNCTIONS
// =====================================================

export async function getAllJobs(): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching jobs:', error);
    return [];
  }

  return data || [];
}

export async function getJobsByStatus(status: Job['status']): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('status', status)
    .order('scheduled_start_date');

  if (error) {
    console.error('Error fetching jobs by status:', error);
    return [];
  }

  return data || [];
}

export async function getJobsByOperator(operatorId: string): Promise<Job[]> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .contains('assigned_operators', [operatorId])
    .order('scheduled_start_date');

  if (error) {
    console.error('Error fetching operator jobs:', error);
    return [];
  }

  return data || [];
}

export async function getJobById(id: string): Promise<Job | null> {
  const { data, error } = await supabase
    .from('jobs')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    console.error('Error fetching job:', error);
    return null;
  }

  return data;
}

export async function createJob(job: Job) {
  const { data, error } = await supabase
    .from('jobs')
    .insert([job])
    .select()
    .single();

  if (error) {
    console.error('Error creating job:', error);
    throw error;
  }

  return data;
}

export async function updateJob(id: string, updates: Partial<Job>) {
  const { data, error } = await supabase
    .from('jobs')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    console.error('Error updating job:', error);
    throw error;
  }

  return data;
}

export async function updateJobStatus(id: string, status: Job['status']) {
  const updates: Partial<Job> = { status };

  // Set timestamps based on status
  if (status === 'in_progress' && !updates.actual_start_time) {
    updates.actual_start_time = new Date().toISOString();
  }
  if (status === 'completed') {
    updates.actual_end_time = new Date().toISOString();
    updates.completed_at = new Date().toISOString();
    updates.progress_percentage = 100;
  }

  return updateJob(id, updates);
}

export async function deleteJob(id: string) {
  const { error } = await supabase
    .from('jobs')
    .delete()
    .eq('id', id);

  if (error) {
    console.error('Error deleting job:', error);
    throw error;
  }
}

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

export function subscribeToJobs(callback: (payload: any) => void) {
  return supabase
    .channel('jobs-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'jobs' }, callback)
    .subscribe();
}

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
