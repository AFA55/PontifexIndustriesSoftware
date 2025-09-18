import { supabase } from './supabase';

// Types for the job management system
export interface Customer {
  id?: string;
  name: string;
  company_name?: string;
  phone?: string;
  email?: string;
  address?: string;
  billing_address?: string;
  contact_person?: string;
  preferred_contact_method?: 'phone' | 'email' | 'text';
  notes?: string;
  status?: 'active' | 'inactive';
  created_at?: string;
  updated_at?: string;
}

export interface JobType {
  id?: string;
  name: string;
  description?: string;
  estimated_duration_hours?: number;
  required_equipment?: string[];
  base_price?: number;
  is_active?: boolean;
  created_at?: string;
}

export interface CrewMember {
  id?: string;
  name: string;
  phone?: string;
  email?: string;
  role?: 'operator' | 'supervisor' | 'driver';
  specialties?: string[];
  hourly_rate?: number;
  is_active?: boolean;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  created_at?: string;
  updated_at?: string;
}

export interface Job {
  id?: string;
  job_number?: string;
  customer_id: string;
  job_type_id?: string;

  // Job Details
  title: string;
  description?: string;
  priority?: 'low' | 'normal' | 'high' | 'urgent';
  status?: 'scheduled' | 'dispatched' | 'in_progress' | 'completed' | 'cancelled' | 'on_hold';

  // Location
  address: string;
  city?: string;
  state?: string;
  zip_code?: string;
  site_contact_name?: string;
  site_contact_phone?: string;

  // Schedule
  scheduled_date: string;
  start_time?: string;
  end_time?: string;
  estimated_duration_hours?: number;
  actual_start_time?: string;
  actual_end_time?: string;

  // Financial
  quoted_price?: number;
  actual_cost?: number;

  // Notes
  job_notes?: string;
  safety_requirements?: string;
  access_instructions?: string;
  special_equipment_notes?: string;

  // Weather
  weather_dependent?: boolean;
  min_temperature?: number;
  no_rain?: boolean;

  // Completion
  completion_notes?: string;
  customer_signature?: string;
  photos?: string[];

  // Relations (populated when fetched)
  customer?: Customer;
  job_type?: JobType;
  assigned_crew?: CrewMember[];
  assigned_equipment?: any[];

  created_at?: string;
  updated_at?: string;
  created_by?: string;
  last_updated_by?: string;
}

export interface JobAssignment {
  id?: string;
  job_id: string;
  crew_member_id: string;
  role_on_job?: 'lead' | 'operator' | 'helper';
  assigned_at?: string;
  checked_in_at?: string;
  checked_out_at?: string;
  hours_worked?: number;
  notes?: string;
}

export interface JobEquipment {
  id?: string;
  job_id: string;
  equipment_id: string;
  assigned_at?: string;
  checked_out_at?: string;
  checked_in_at?: string;
  condition_out?: 'excellent' | 'good' | 'fair' | 'poor';
  condition_in?: 'excellent' | 'good' | 'fair' | 'poor';
  fuel_level_out?: number;
  fuel_level_in?: number;
  hours_used?: number;
  notes?: string;
}

// Customer Functions
export async function createCustomer(customerData: Customer) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .insert([customerData])
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error creating customer:', error);
    return { success: false, error: error.message };
  }
}

export async function getAllCustomers() {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .eq('status', 'active')
      .order('name');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching customers:', error);
    return { success: false, error: error.message, data: [] };
  }
}

// Job Type Functions
export async function getAllJobTypes() {
  try {
    const { data, error } = await supabase
      .from('job_types')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching job types:', error);
    return { success: false, error: error.message, data: [] };
  }
}

// Crew Functions
export async function getAllCrewMembers() {
  try {
    const { data, error } = await supabase
      .from('crew_members')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching crew members:', error);
    return { success: false, error: error.message, data: [] };
  }
}

// Job Functions
export async function createJob(jobData: Job) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .insert([{
        ...jobData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }])
      .select(`
        *,
        customer:customers(*),
        job_type:job_types(*)
      `)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error creating job:', error);
    return { success: false, error: error.message };
  }
}

export async function getAllJobs() {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:customers(*),
        job_type:job_types(*)
      `)
      .order('scheduled_date', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching jobs:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function getJobsByDate(date: string) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:customers(*),
        job_type:job_types(*)
      `)
      .eq('scheduled_date', date)
      .order('start_time');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching jobs by date:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function getJobsByDateRange(startDate: string, endDate: string) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:customers(*),
        job_type:job_types(*)
      `)
      .gte('scheduled_date', startDate)
      .lte('scheduled_date', endDate)
      .order('scheduled_date', { ascending: true });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching jobs by date range:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function updateJobStatus(jobId: string, newStatus: Job['status'], updatedBy: string, reason?: string) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .update({
        status: newStatus,
        last_updated_by: updatedBy,
        updated_at: new Date().toISOString()
      })
      .eq('id', jobId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating job status:', error);
    return { success: false, error: error.message };
  }
}

export async function assignCrewToJob(jobId: string, crewMemberId: string, roleOnJob: string = 'operator') {
  try {
    const { data, error } = await supabase
      .from('job_assignments')
      .insert([{
        job_id: jobId,
        crew_member_id: crewMemberId,
        role_on_job: roleOnJob,
        assigned_at: new Date().toISOString()
      }])
      .select(`
        *,
        crew_member:crew_members(*)
      `)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error assigning crew to job:', error);
    return { success: false, error: error.message };
  }
}

export async function assignEquipmentToJob(jobId: string, equipmentId: string) {
  try {
    const { data, error } = await supabase
      .from('job_equipment')
      .insert([{
        job_id: jobId,
        equipment_id: equipmentId,
        assigned_at: new Date().toISOString(),
        condition_out: 'good'
      }])
      .select(`
        *,
        equipment:equipment(*)
      `)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error assigning equipment to job:', error);
    return { success: false, error: error.message };
  }
}

export async function getJobAssignments(jobId: string) {
  try {
    const { data, error } = await supabase
      .from('job_assignments')
      .select(`
        *,
        crew_member:crew_members(*)
      `)
      .eq('job_id', jobId);

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching job assignments:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function getJobEquipment(jobId: string) {
  try {
    const { data, error } = await supabase
      .from('job_equipment')
      .select(`
        *,
        equipment:equipment(*)
      `)
      .eq('job_id', jobId);

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching job equipment:', error);
    return { success: false, error: error.message, data: [] };
  }
}

// Dashboard Analytics for Jobs
export async function getJobDashboardMetrics() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const weekStart = startOfWeek.toISOString().split('T')[0];

    const [todayJobs, weekJobs, allJobs] = await Promise.all([
      getJobsByDate(today),
      getJobsByDateRange(weekStart, today),
      getAllJobs()
    ]);

    const todayStats = {
      total: todayJobs.data?.length || 0,
      completed: todayJobs.data?.filter(j => j.status === 'completed').length || 0,
      inProgress: todayJobs.data?.filter(j => j.status === 'in_progress').length || 0,
      scheduled: todayJobs.data?.filter(j => j.status === 'scheduled').length || 0
    };

    const weekStats = {
      total: weekJobs.data?.length || 0,
      completed: weekJobs.data?.filter(j => j.status === 'completed').length || 0,
      revenue: weekJobs.data?.reduce((sum, job) => sum + (job.quoted_price || 0), 0) || 0
    };

    return {
      success: true,
      data: {
        today: todayStats,
        week: weekStats,
        totalJobs: allJobs.data?.length || 0
      }
    };
  } catch (error: any) {
    console.error('Error getting job dashboard metrics:', error);
    return { success: false, error: error.message };
  }
}

// Quick search for jobs
export async function searchJobs(query: string) {
  try {
    const { data, error } = await supabase
      .from('jobs')
      .select(`
        *,
        customer:customers(*),
        job_type:job_types(*)
      `)
      .or(`title.ilike.%${query}%,description.ilike.%${query}%,address.ilike.%${query}%,job_number.ilike.%${query}%`)
      .order('scheduled_date', { ascending: false })
      .limit(20);

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error searching jobs:', error);
    return { success: false, error: error.message, data: [] };
  }
}