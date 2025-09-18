import { supabase } from './supabase';

// Types for Phase 2 features
export interface DailyJobTicket {
  id?: string;
  job_id: string;
  crew_member_id: string;

  // Date & Time
  work_date: string;
  start_time?: string;
  end_time?: string;
  break_duration_minutes?: number;
  total_hours_worked?: number;

  // Work Completed
  cutting_completed?: string;
  linear_feet_cut?: number;
  square_feet_cut?: number;
  holes_drilled?: number;

  // Material Conditions
  concrete_thickness_inches?: number;
  rebar_present?: boolean;
  rebar_density?: 'none' | 'light' | 'medium' | 'heavy';
  concrete_hardness?: 'soft' | 'normal' | 'hard' | 'very_hard';

  // Weather & Site
  weather_conditions?: string;
  site_conditions?: string;
  access_issues?: string;

  // Equipment Used
  equipment_scanned?: string[];

  // Blade Usage
  blades_used?: BladeUsageRecord[];

  // Issues & Notes
  equipment_issues?: string;
  safety_incidents?: string;
  delays_encountered?: string;
  notes?: string;

  // Completion
  work_completed?: boolean;
  ready_for_next_day?: boolean;
  requires_follow_up?: boolean;

  // Photos
  progress_photos?: string[];

  // Submission
  submitted_at?: string;
  submitted_by: string;
  approved_by?: string;
  approved_at?: string;

  // Relations (populated when fetched)
  job?: any;
  crew_member?: any;
}

export interface Blade {
  id?: string;
  blade_id: string;
  blade_type: 'diamond' | 'abrasive' | 'carbide';
  blade_size: string;
  manufacturer?: string;
  model_number?: string;

  // Specifications
  max_cutting_depth?: number;
  recommended_rpm?: number;
  material_types?: string[];

  // Tracking
  purchase_date?: string;
  purchase_cost?: number;
  current_condition?: 'new' | 'good' | 'worn' | 'damaged' | 'retired';

  // Usage Statistics
  total_linear_feet_cut?: number;
  total_hours_used?: number;
  jobs_used_on?: number;

  // Current Status
  current_location?: string;
  assigned_to_equipment?: string;
  is_active?: boolean;
}

export interface BladeUsageRecord {
  blade_id: string;
  equipment_id: string;
  start_condition: string;
  end_condition: string;
  linear_feet_cut: number;
  cutting_time_minutes: number;
  material_cut: string;
  material_hardness: string;
  rebar_encountered: boolean;
  cutting_depth: number;
  cutting_speed: number;
  blade_performance: string;
  problems_encountered?: string;
  blade_damage?: string;
  replacement_needed: boolean;
}

export interface BladeUsageLog {
  id?: string;
  daily_ticket_id: string;
  blade_id: string;
  equipment_id: string;
  start_condition?: string;
  end_condition?: string;
  linear_feet_cut?: number;
  cutting_time_minutes?: number;
  material_cut?: string;
  material_hardness?: string;
  rebar_encountered?: boolean;
  cutting_depth?: number;
  cutting_speed?: number;
  blade_performance?: string;
  problems_encountered?: string;
  blade_damage?: string;
  replacement_needed?: boolean;
  blade_photos?: string[];
  logged_at?: string;
  logged_by: string;
}

// Daily Job Ticket Functions
export async function createDailyJobTicket(ticketData: DailyJobTicket) {
  try {
    const { data, error } = await supabase
      .from('daily_job_tickets')
      .insert([{
        ...ticketData,
        submitted_at: new Date().toISOString()
      }])
      .select(`
        *,
        job:jobs(*),
        crew_member:crew_members(*)
      `)
      .single();

    if (error) throw error;

    // Log blade usage if provided
    if (ticketData.blades_used && ticketData.blades_used.length > 0) {
      for (const bladeUsage of ticketData.blades_used) {
        await logBladeUsage(data.id!, bladeUsage, ticketData.submitted_by);
      }
    }

    return { success: true, data };
  } catch (error: any) {
    console.error('Error creating daily job ticket:', error);
    return { success: false, error: error.message };
  }
}

export async function getDailyJobTicketsByDate(date: string, crewMemberId?: string) {
  try {
    let query = supabase
      .from('daily_job_tickets')
      .select(`
        *,
        job:jobs(
          *,
          customer:customers(*)
        ),
        crew_member:crew_members(*)
      `)
      .eq('work_date', date);

    if (crewMemberId) {
      query = query.eq('crew_member_id', crewMemberId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching daily job tickets:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function getCrewDailyJobs(crewMemberId: string, date: string) {
  try {
    const { data, error } = await supabase
      .from('crew_daily_jobs')
      .select('*')
      .eq('crew_member_id', crewMemberId)
      .eq('work_date', date);

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching crew daily jobs:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function updateDailyJobTicket(ticketId: string, updates: Partial<DailyJobTicket>) {
  try {
    const { data, error } = await supabase
      .from('daily_job_tickets')
      .update({
        ...updates,
        updated_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating daily job ticket:', error);
    return { success: false, error: error.message };
  }
}

export async function approveDailyJobTicket(ticketId: string, approvedBy: string) {
  try {
    const { data, error } = await supabase
      .from('daily_job_tickets')
      .update({
        approved_by: approvedBy,
        approved_at: new Date().toISOString()
      })
      .eq('id', ticketId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error approving daily job ticket:', error);
    return { success: false, error: error.message };
  }
}

// Blade Management Functions
export async function getAllBlades() {
  try {
    const { data, error } = await supabase
      .from('blades')
      .select('*')
      .eq('is_active', true)
      .order('blade_id');

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching blades:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function getBladeById(bladeId: string) {
  try {
    const { data, error } = await supabase
      .from('blades')
      .select('*')
      .eq('blade_id', bladeId)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error fetching blade:', error);
    return { success: false, error: error.message, data: null };
  }
}

export async function updateBladeUsage(bladeId: string, linearFeetCut: number, hoursUsed: number) {
  try {
    const { data, error } = await supabase
      .from('blades')
      .update({
        total_linear_feet_cut: supabase.raw(`total_linear_feet_cut + ${linearFeetCut}`),
        total_hours_used: supabase.raw(`total_hours_used + ${hoursUsed}`),
        jobs_used_on: supabase.raw('jobs_used_on + 1'),
        updated_at: new Date().toISOString()
      })
      .eq('id', bladeId)
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating blade usage:', error);
    return { success: false, error: error.message };
  }
}

// Blade Usage Logging
export async function logBladeUsage(dailyTicketId: string, bladeUsage: BladeUsageRecord, loggedBy: string) {
  try {
    const { data, error } = await supabase
      .from('blade_usage_logs')
      .insert([{
        daily_ticket_id: dailyTicketId,
        ...bladeUsage,
        logged_by: loggedBy,
        logged_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw error;

    // Update blade statistics
    await updateBladeUsage(
      bladeUsage.blade_id,
      bladeUsage.linear_feet_cut,
      bladeUsage.cutting_time_minutes / 60
    );

    return { success: true, data };
  } catch (error: any) {
    console.error('Error logging blade usage:', error);
    return { success: false, error: error.message };
  }
}

export async function getBladeUsageHistory(bladeId: string) {
  try {
    const { data, error } = await supabase
      .from('blade_usage_logs')
      .select(`
        *,
        daily_ticket:daily_job_tickets(
          work_date,
          job:jobs(job_number, title)
        ),
        equipment:equipment(name, type)
      `)
      .eq('blade_id', bladeId)
      .order('logged_at', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching blade usage history:', error);
    return { success: false, error: error.message, data: [] };
  }
}

// Equipment Scanning Functions
export async function scanEquipmentForJob(equipmentId: string, jobId: string, crewMemberId: string, condition: string = 'good') {
  try {
    const { data, error } = await supabase
      .from('qr_scan_logs')
      .insert([{
        equipment_id: equipmentId,
        scanned_by: crewMemberId,
        scan_purpose: 'job_start',
        device_info: { job_id: jobId },
        verified_equipment: true,
        equipment_condition: condition,
        timestamp: new Date().toISOString()
      }])
      .select(`
        *,
        equipment:equipment(*)
      `)
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error scanning equipment:', error);
    return { success: false, error: error.message };
  }
}

export async function getJobEquipmentScans(jobId: string, date?: string) {
  try {
    let query = supabase
      .from('qr_scan_logs')
      .select(`
        *,
        equipment:equipment(*)
      `)
      .contains('device_info', { job_id: jobId });

    if (date) {
      const startOfDay = `${date}T00:00:00Z`;
      const endOfDay = `${date}T23:59:59Z`;
      query = query.gte('timestamp', startOfDay).lte('timestamp', endOfDay);
    }

    const { data, error } = await query.order('timestamp', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching job equipment scans:', error);
    return { success: false, error: error.message, data: [] };
  }
}

// Analytics Functions
export async function getJobPerformanceSummary(jobId?: string) {
  try {
    let query = supabase.from('job_performance_summary').select('*');

    if (jobId) {
      query = query.eq('id', jobId);
    }

    const { data, error } = await query.order('actual_hours_worked', { ascending: false });

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error fetching job performance summary:', error);
    return { success: false, error: error.message, data: [] };
  }
}

export async function getDailyProductivityMetrics(date: string) {
  try {
    const { data, error } = await supabase
      .from('daily_job_tickets')
      .select(`
        *,
        job:jobs(job_number, title),
        crew_member:crew_members(name, role)
      `)
      .eq('work_date', date)
      .eq('work_completed', true);

    if (error) throw error;

    // Calculate metrics
    const metrics = {
      totalHours: data.reduce((sum, ticket) => sum + (ticket.total_hours_worked || 0), 0),
      totalLinearFeet: data.reduce((sum, ticket) => sum + (ticket.linear_feet_cut || 0), 0),
      totalSquareFeet: data.reduce((sum, ticket) => sum + (ticket.square_feet_cut || 0), 0),
      totalHolesDrilled: data.reduce((sum, ticket) => sum + (ticket.holes_drilled || 0), 0),
      activeCrews: new Set(data.map(ticket => ticket.crew_member_id)).size,
      activeJobs: new Set(data.map(ticket => ticket.job_id)).size,
      averageProductivity: data.length > 0
        ? data.reduce((sum, ticket) => sum + (ticket.linear_feet_cut || 0), 0) / data.length
        : 0
    };

    return { success: true, data: metrics };
  } catch (error: any) {
    console.error('Error calculating daily productivity metrics:', error);
    return { success: false, error: error.message };
  }
}

// Mobile-Optimized Functions
export async function getCrewJobsForToday(crewMemberId: string) {
  const today = new Date().toISOString().split('T')[0];
  return getCrewDailyJobs(crewMemberId, today);
}

export async function submitDailyTicketWithPhotos(ticketData: DailyJobTicket, photos: File[]) {
  try {
    // Upload photos first (placeholder - implement file upload)
    const photoUrls: string[] = [];
    // TODO: Implement photo upload to Supabase storage

    const ticketWithPhotos = {
      ...ticketData,
      progress_photos: photoUrls
    };

    return await createDailyJobTicket(ticketWithPhotos);
  } catch (error: any) {
    console.error('Error submitting daily ticket with photos:', error);
    return { success: false, error: error.message };
  }
}