import { supabase } from './supabase';

// Types for data collection
export interface UsageLog {
  equipment_id: string;
  user_name: string;
  action: 'checked_out' | 'checked_in' | 'maintenance_start' | 'maintenance_end' | 'scan';
  location?: string;
  notes?: string;
  duration_minutes?: number;
}

export interface MaintenanceRecord {
  equipment_id: string;
  maintenance_type: 'routine' | 'repair' | 'inspection' | 'emergency';
  description: string;
  technician_name: string;
  cost?: number;
  parts_used?: Array<{name: string; cost: number}>;
  hours_worked?: number;
  next_service_date?: string;
}

export interface JobSite {
  name: string;
  address?: string;
  client_name?: string;
  project_type?: string;
  start_date?: string;
  end_date?: string;
  status?: 'active' | 'completed' | 'paused';
}

export interface QRScanLog {
  equipment_id: string;
  scanned_by?: string;
  scan_location?: string;
  scan_purpose?: 'checkout' | 'checkin' | 'inspection' | 'maintenance';
  device_info?: any;
}

// Data Collection Functions
export async function logEquipmentUsage(data: UsageLog) {
  try {
    const { error } = await supabase
      .from('equipment_usage_logs')
      .insert([{
        ...data,
        timestamp: new Date().toISOString()
      }]);

    if (error) throw error;

    // Also log user activity
    await logUserActivity(data.user_name, `equipment_${data.action}`, {
      equipment_id: data.equipment_id,
      location: data.location
    });

    return { success: true };
  } catch (error: any) {
    console.error('Error logging equipment usage:', error);
    return { success: false, error: error.message };
  }
}

export async function logMaintenanceRecord(data: MaintenanceRecord) {
  try {
    const { error } = await supabase
      .from('maintenance_records')
      .insert([{
        ...data,
        parts_used: data.parts_used || [],
        service_date: new Date().toISOString()
      }]);

    if (error) throw error;

    // Update equipment status if maintenance is starting
    if (data.maintenance_type !== 'inspection') {
      await supabase
        .from('equipment')
        .update({
          status: 'Maintenance',
          last_service_date: new Date().toISOString(),
          next_service_due: data.next_service_date
        })
        .eq('id', data.equipment_id);
    }

    return { success: true };
  } catch (error: any) {
    console.error('Error logging maintenance record:', error);
    return { success: false, error: error.message };
  }
}

export async function logQRScan(data: QRScanLog) {
  try {
    const { error } = await supabase
      .from('qr_scan_logs')
      .insert([{
        ...data,
        timestamp: new Date().toISOString()
      }]);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error logging QR scan:', error);
    return { success: false, error: error.message };
  }
}

export async function logUserActivity(user_name: string, action: string, details?: any) {
  try {
    const { error } = await supabase
      .from('user_activity_logs')
      .insert([{
        user_name,
        action,
        details: details || {},
        timestamp: new Date().toISOString()
      }]);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error logging user activity:', error);
    return { success: false, error: error.message };
  }
}

// Analytics Functions
export async function getEquipmentUtilization(days: number = 30) {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await supabase
      .from('equipment_usage_logs')
      .select(`
        equipment_id,
        action,
        duration_minutes,
        timestamp,
        equipment:equipment_id (name, type)
      `)
      .gte('timestamp', startDate.toISOString());

    if (error) throw error;

    // Process data to calculate utilization rates
    const utilization = data.reduce((acc: any, log: any) => {
      const equipmentId = log.equipment_id;
      if (!acc[equipmentId]) {
        acc[equipmentId] = {
          name: log.equipment?.name || 'Unknown',
          type: log.equipment?.type || 'Unknown',
          totalUsage: 0,
          checkouts: 0,
          checkins: 0
        };
      }

      if (log.action === 'checked_out') acc[equipmentId].checkouts++;
      if (log.action === 'checked_in') acc[equipmentId].checkins++;
      if (log.duration_minutes) acc[equipmentId].totalUsage += log.duration_minutes;

      return acc;
    }, {});

    return { success: true, data: utilization };
  } catch (error: any) {
    console.error('Error getting equipment utilization:', error);
    return { success: false, error: error.message };
  }
}

export async function getMaintenanceCosts(months: number = 6) {
  try {
    const startDate = new Date();
    startDate.setMonth(startDate.getMonth() - months);

    const { data, error } = await supabase
      .from('maintenance_records')
      .select(`
        equipment_id,
        maintenance_type,
        cost,
        hours_worked,
        service_date,
        equipment:equipment_id (name, type)
      `)
      .gte('service_date', startDate.toISOString())
      .order('service_date', { ascending: false });

    if (error) throw error;

    // Calculate costs by equipment and type
    const costAnalysis = {
      totalCost: data.reduce((sum: number, record: any) => sum + (record.cost || 0), 0),
      byEquipment: data.reduce((acc: any, record: any) => {
        const equipmentId = record.equipment_id;
        if (!acc[equipmentId]) {
          acc[equipmentId] = {
            name: record.equipment?.name || 'Unknown',
            type: record.equipment?.type || 'Unknown',
            totalCost: 0,
            recordCount: 0
          };
        }
        acc[equipmentId].totalCost += record.cost || 0;
        acc[equipmentId].recordCount++;
        return acc;
      }, {}),
      byType: data.reduce((acc: any, record: any) => {
        const type = record.maintenance_type;
        if (!acc[type]) acc[type] = 0;
        acc[type] += record.cost || 0;
        return acc;
      }, {})
    };

    return { success: true, data: costAnalysis };
  } catch (error: any) {
    console.error('Error getting maintenance costs:', error);
    return { success: false, error: error.message };
  }
}

export async function getUsagePatterns() {
  try {
    const { data, error } = await supabase
      .from('equipment_usage_logs')
      .select(`
        user_name,
        action,
        timestamp,
        equipment:equipment_id (name, type)
      `)
      .gte('timestamp', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()) // Last 30 days
      .order('timestamp', { ascending: false });

    if (error) throw error;

    // Analyze patterns by hour, day, user
    const patterns = {
      byHour: new Array(24).fill(0),
      byDay: {} as Record<string, number>,
      byUser: {} as Record<string, number>,
      mostUsedEquipment: {} as Record<string, number>
    };

    data.forEach((log: any) => {
      const date = new Date(log.timestamp);
      const hour = date.getHours();
      const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });

      patterns.byHour[hour]++;
      patterns.byDay[dayName] = (patterns.byDay[dayName] || 0) + 1;
      patterns.byUser[log.user_name] = (patterns.byUser[log.user_name] || 0) + 1;

      if (log.equipment?.name) {
        patterns.mostUsedEquipment[log.equipment.name] =
          (patterns.mostUsedEquipment[log.equipment.name] || 0) + 1;
      }
    });

    return { success: true, data: patterns };
  } catch (error: any) {
    console.error('Error getting usage patterns:', error);
    return { success: false, error: error.message };
  }
}

// Automation Functions
export async function checkMaintenanceDue() {
  try {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabase
      .from('equipment')
      .select('*')
      .lte('next_service_due', today)
      .neq('status', 'Maintenance');

    if (error) throw error;

    // Create alerts for overdue maintenance
    for (const equipment of data) {
      await createAlert({
        equipment_id: equipment.id,
        alert_type: 'maintenance_due',
        severity: 'high',
        message: `${equipment.name} (${equipment.serial_number}) is due for maintenance`
      });
    }

    return { success: true, data: data.length };
  } catch (error: any) {
    console.error('Error checking maintenance due:', error);
    return { success: false, error: error.message };
  }
}

export async function createAlert(alertData: {
  equipment_id: string;
  alert_type: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  message: string;
}) {
  try {
    const { error } = await supabase
      .from('automated_alerts')
      .insert([{
        ...alertData,
        triggered_at: new Date().toISOString()
      }]);

    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error('Error creating alert:', error);
    return { success: false, error: error.message };
  }
}

export async function getActiveAlerts() {
  try {
    const { data, error } = await supabase
      .from('automated_alerts')
      .select(`
        *,
        equipment:equipment_id (name, serial_number, type)
      `)
      .eq('status', 'active')
      .order('triggered_at', { ascending: false });

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error getting active alerts:', error);
    return { success: false, error: error.message };
  }
}

// Dashboard Analytics
export async function getDashboardMetrics() {
  try {
    const [
      equipment,
      recentUsage,
      maintenanceDue,
      activeAlerts
    ] = await Promise.all([
      supabase.from('equipment').select('status'),
      getUsagePatterns(),
      checkMaintenanceDue(),
      getActiveAlerts()
    ]);

    const equipmentStats = equipment.data?.reduce((acc: any, item: any) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {}) || {};

    return {
      success: true,
      data: {
        equipmentStats,
        usagePatterns: recentUsage.data,
        maintenanceDueCount: maintenanceDue.data,
        alertCount: activeAlerts.data?.length || 0,
        totalEquipment: equipment.data?.length || 0
      }
    };
  } catch (error: any) {
    console.error('Error getting dashboard metrics:', error);
    return { success: false, error: error.message };
  }
}