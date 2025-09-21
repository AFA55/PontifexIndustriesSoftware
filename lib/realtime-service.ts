import { supabase } from './supabase';
import { Job } from './jobs-service';

// Types for real-time tracking
export interface JobStatusUpdate {
  job_id: string;
  old_status: string;
  new_status: string;
  updated_by: string;
  location?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
  };
  timestamp: string;
  notes?: string;
}

export interface CrewLocationUpdate {
  crew_member_id: string;
  job_id?: string;
  location: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    heading?: number;
    speed?: number;
  };
  timestamp: string;
  activity_status: 'traveling' | 'on_site' | 'break' | 'offline';
}

export interface EquipmentStatusUpdate {
  equipment_id: string;
  job_id?: string;
  status: 'idle' | 'in_use' | 'maintenance' | 'offline';
  location?: {
    latitude: number;
    longitude: number;
  };
  operator_id?: string;
  fuel_level?: number;
  engine_hours?: number;
  timestamp: string;
}

// Real-time subscriptions for job updates
export class RealtimeJobTracker {
  private subscriptions: any[] = [];
  private callbacks: Map<string, (data: any) => void> = new Map();

  // Subscribe to job status changes
  subscribeToJobUpdates(callback: (update: JobStatusUpdate) => void) {
    const subscription = supabase
      .channel('job_status_updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          select: '*'
        },
        (payload) => {
          const update: JobStatusUpdate = {
            job_id: payload.new.id,
            old_status: payload.old?.status || 'unknown',
            new_status: payload.new.status,
            updated_by: payload.new.last_updated_by || 'system',
            timestamp: payload.new.updated_at
          };
          callback(update);
        }
      )
      .subscribe();

    this.subscriptions.push(subscription);
    return subscription;
  }

  // Subscribe to crew location updates
  subscribeToCrewLocations(callback: (update: CrewLocationUpdate) => void) {
    const subscription = supabase
      .channel('crew_locations')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'crew_location_logs'
        },
        (payload) => {
          if (payload.new) {
            const update: CrewLocationUpdate = {
              crew_member_id: payload.new.crew_member_id,
              job_id: payload.new.job_id,
              location: payload.new.location,
              timestamp: payload.new.timestamp,
              activity_status: payload.new.activity_status
            };
            callback(update);
          }
        }
      )
      .subscribe();

    this.subscriptions.push(subscription);
    return subscription;
  }

  // Subscribe to equipment status updates
  subscribeToEquipmentStatus(callback: (update: EquipmentStatusUpdate) => void) {
    const subscription = supabase
      .channel('equipment_status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'equipment_status_logs'
        },
        (payload) => {
          if (payload.new) {
            const update: EquipmentStatusUpdate = {
              equipment_id: payload.new.equipment_id,
              job_id: payload.new.job_id,
              status: payload.new.status,
              location: payload.new.location,
              operator_id: payload.new.operator_id,
              fuel_level: payload.new.fuel_level,
              engine_hours: payload.new.engine_hours,
              timestamp: payload.new.timestamp
            };
            callback(update);
          }
        }
      )
      .subscribe();

    this.subscriptions.push(subscription);
    return subscription;
  }

  // Unsubscribe from all channels
  unsubscribeAll() {
    this.subscriptions.forEach(subscription => {
      supabase.removeChannel(subscription);
    });
    this.subscriptions = [];
    this.callbacks.clear();
  }
}

// Job status update functions
export async function updateJobStatusRealtime(
  jobId: string,
  newStatus: Job['status'],
  updatedBy: string,
  location?: { latitude: number; longitude: number },
  notes?: string
) {
  try {
    // Update job status in database
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

    // Log the status change for history
    await supabase
      .from('job_status_history')
      .insert({
        job_id: jobId,
        old_status: data.status, // This will be updated by trigger
        new_status: newStatus,
        updated_by: updatedBy,
        location: location,
        notes: notes,
        timestamp: new Date().toISOString()
      });

    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating job status:', error);
    return { success: false, error: error.message };
  }
}

// Crew location tracking
export async function updateCrewLocation(
  crewMemberId: string,
  location: { latitude: number; longitude: number; accuracy?: number },
  activityStatus: CrewLocationUpdate['activity_status'] = 'on_site',
  jobId?: string
) {
  try {
    const { data, error } = await supabase
      .from('crew_location_logs')
      .insert({
        crew_member_id: crewMemberId,
        job_id: jobId,
        location: {
          latitude: location.latitude,
          longitude: location.longitude,
          accuracy: location.accuracy || 10
        },
        activity_status: activityStatus,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Update crew member's current location
    await supabase
      .from('crew_members')
      .update({
        current_location: location,
        last_location_update: new Date().toISOString(),
        current_status: activityStatus
      })
      .eq('id', crewMemberId);

    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating crew location:', error);
    return { success: false, error: error.message };
  }
}

// Equipment status tracking
export async function updateEquipmentStatus(
  equipmentId: string,
  status: EquipmentStatusUpdate['status'],
  options: {
    jobId?: string;
    operatorId?: string;
    location?: { latitude: number; longitude: number };
    fuelLevel?: number;
    engineHours?: number;
  } = {}
) {
  try {
    const { data, error } = await supabase
      .from('equipment_status_logs')
      .insert({
        equipment_id: equipmentId,
        job_id: options.jobId,
        status: status,
        location: options.location,
        operator_id: options.operatorId,
        fuel_level: options.fuelLevel,
        engine_hours: options.engineHours,
        timestamp: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    // Update equipment's current status
    await supabase
      .from('equipment')
      .update({
        status: status === 'in_use' ? 'In Use' :
               status === 'maintenance' ? 'Maintenance' :
               status === 'offline' ? 'Offline' : 'Available',
        current_location: options.location,
        current_operator: options.operatorId,
        last_status_update: new Date().toISOString()
      })
      .eq('id', equipmentId);

    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating equipment status:', error);
    return { success: false, error: error.message };
  }
}

// Get real-time dashboard data
export async function getRealtimeDashboardData() {
  try {
    const [jobsResult, crewResult, equipmentResult] = await Promise.all([
      // Active jobs with real-time status
      supabase
        .from('jobs')
        .select(`
          *,
          customer:customers(name, phone),
          assigned_crew:job_assignments(
            crew_member:crew_members(*)
          )
        `)
        .in('status', ['scheduled', 'dispatched', 'in_progress'])
        .order('scheduled_date'),

      // Crew locations and status
      supabase
        .from('crew_members')
        .select('*')
        .eq('is_active', true),

      // Equipment status
      supabase
        .from('equipment')
        .select('*')
        .neq('status', 'Retired')
    ]);

    return {
      success: true,
      data: {
        activeJobs: jobsResult.data || [],
        crewMembers: crewResult.data || [],
        equipment: equipmentResult.data || []
      }
    };
  } catch (error: any) {
    console.error('Error getting realtime dashboard data:', error);
    return { success: false, error: error.message };
  }
}

// Geolocation utilities
export function getCurrentLocation(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation is not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      resolve,
      reject,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000
      }
    );
  });
}

export function watchLocation(
  callback: (position: GeolocationPosition) => void,
  errorCallback?: (error: GeolocationPositionError) => void
): number {
  if (!navigator.geolocation) {
    throw new Error('Geolocation is not supported');
  }

  return navigator.geolocation.watchPosition(
    callback,
    errorCallback,
    {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 30000
    }
  );
}

// Distance calculation between two points
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;

  const a =
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c; // Distance in kilometers

  return distance;
}

// Check if crew member is at job site
export async function checkCrewAtJobSite(
  crewMemberId: string,
  jobId: string,
  tolerance: number = 0.1 // km
): Promise<{ isOnSite: boolean; distance?: number }> {
  try {
    // Get job location
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select('address, site_coordinates')
      .eq('id', jobId)
      .single();

    if (jobError) throw jobError;

    // Get crew location
    const { data: crewLocation, error: crewError } = await supabase
      .from('crew_members')
      .select('current_location')
      .eq('id', crewMemberId)
      .single();

    if (crewError) throw crewError;

    if (!job.site_coordinates || !crewLocation.current_location) {
      return { isOnSite: false };
    }

    const distance = calculateDistance(
      crewLocation.current_location.latitude,
      crewLocation.current_location.longitude,
      job.site_coordinates.latitude,
      job.site_coordinates.longitude
    );

    return {
      isOnSite: distance <= tolerance,
      distance
    };
  } catch (error: any) {
    console.error('Error checking crew location:', error);
    return { isOnSite: false };
  }
}

export default RealtimeJobTracker;