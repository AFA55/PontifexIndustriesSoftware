import { supabase } from './supabase';

// Types for notifications
export interface NotificationMessage {
  id?: string;
  recipient_type: 'crew_member' | 'customer' | 'admin';
  recipient_id: string;
  message_type: 'sms' | 'email' | 'push';
  subject?: string;
  message: string;
  job_id?: string;
  priority?: 1 | 2 | 3 | 4 | 5; // 1=urgent, 5=low
  send_at?: string;
  status?: 'pending' | 'sent' | 'delivered' | 'failed' | 'cancelled';
}

export interface SMSTemplate {
  id: string;
  name: string;
  template: string;
  variables: string[];
  description: string;
}

export interface NotificationPreferences {
  crew_member_id: string;
  sms_enabled: boolean;
  email_enabled: boolean;
  push_enabled: boolean;
  job_assignments: boolean;
  schedule_changes: boolean;
  weather_alerts: boolean;
  maintenance_reminders: boolean;
  emergency_alerts: boolean;
}

// SMS Templates for common notifications
export const SMS_TEMPLATES: { [key: string]: SMSTemplate } = {
  JOB_ASSIGNMENT: {
    id: 'job_assignment',
    name: 'Job Assignment',
    template: 'Hi {crew_name}! You\'ve been assigned to job {job_number} on {date} at {time}. Location: {address}. Customer: {customer_name}. Reply CONFIRM to acknowledge.',
    variables: ['crew_name', 'job_number', 'date', 'time', 'address', 'customer_name'],
    description: 'Notify crew member of new job assignment'
  },
  SCHEDULE_CHANGE: {
    id: 'schedule_change',
    name: 'Schedule Change',
    template: 'SCHEDULE UPDATE: Job {job_number} has been {change_type} to {new_date} at {new_time}. Location: {address}. Please confirm receipt.',
    variables: ['job_number', 'change_type', 'new_date', 'new_time', 'address'],
    description: 'Notify of schedule changes'
  },
  WEATHER_ALERT: {
    id: 'weather_alert',
    name: 'Weather Alert',
    template: 'WEATHER ALERT: Job {job_number} scheduled for {date} may be affected by {weather_condition}. Check dashboard for updates or contact dispatch.',
    variables: ['job_number', 'date', 'weather_condition'],
    description: 'Weather-related job alerts'
  },
  JOB_REMINDER: {
    id: 'job_reminder',
    name: 'Job Reminder',
    template: 'Reminder: You have job {job_number} tomorrow at {time}. Location: {address}. Customer: {customer_name}. Equipment: {equipment}.',
    variables: ['job_number', 'time', 'address', 'customer_name', 'equipment'],
    description: 'Day-before job reminder'
  },
  CUSTOMER_UPDATE: {
    id: 'customer_update',
    name: 'Customer Update',
    template: 'Hi {customer_name}, update on your concrete cutting job {job_number}: {status_message}. Expected completion: {completion_time}. Questions? Call {company_phone}.',
    variables: ['customer_name', 'job_number', 'status_message', 'completion_time', 'company_phone'],
    description: 'Customer job status updates'
  },
  EQUIPMENT_ALERT: {
    id: 'equipment_alert',
    name: 'Equipment Alert',
    template: 'EQUIPMENT ALERT: {equipment_name} ({equipment_id}) requires attention: {alert_message}. Current location: {location}.',
    variables: ['equipment_name', 'equipment_id', 'alert_message', 'location'],
    description: 'Equipment maintenance or issue alerts'
  }
};

// Queue notification for sending
export async function queueNotification(notification: NotificationMessage) {
  try {
    const { data, error } = await supabase
      .from('notification_queue')
      .insert({
        recipient_type: notification.recipient_type,
        recipient_id: notification.recipient_id,
        message_type: notification.message_type,
        subject: notification.subject,
        message: notification.message,
        job_id: notification.job_id,
        priority: notification.priority || 3,
        send_at: notification.send_at || new Date().toISOString(),
        status: 'pending'
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error queueing notification:', error);
    return { success: false, error: error.message };
  }
}

// Send notification using template
export async function sendTemplatedNotification(
  templateId: string,
  recipientType: NotificationMessage['recipient_type'],
  recipientId: string,
  variables: { [key: string]: string },
  options: {
    jobId?: string;
    priority?: number;
    sendAt?: string;
    messageType?: 'sms' | 'email' | 'push';
  } = {}
) {
  try {
    const template = SMS_TEMPLATES[templateId];
    if (!template) {
      throw new Error(`Template ${templateId} not found`);
    }

    // Replace variables in template
    let message = template.template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(new RegExp(`{${key}}`, 'g'), value);
    }

    // Check for unreplaced variables
    const unresolved = message.match(/{[^}]+}/g);
    if (unresolved) {
      console.warn(`Unresolved variables in template ${templateId}:`, unresolved);
    }

    const notification: NotificationMessage = {
      recipient_type: recipientType,
      recipient_id: recipientId,
      message_type: options.messageType || 'sms',
      subject: template.name,
      message: message,
      job_id: options.jobId,
      priority: options.priority || 3,
      send_at: options.sendAt
    };

    return await queueNotification(notification);
  } catch (error: any) {
    console.error('Error sending templated notification:', error);
    return { success: false, error: error.message };
  }
}

// Job assignment notification
export async function notifyJobAssignment(
  jobId: string,
  crewMemberId: string,
  jobDetails: {
    job_number: string;
    date: string;
    time: string;
    address: string;
    customer_name: string;
  }
) {
  try {
    // Get crew member details
    const { data: crewMember, error } = await supabase
      .from('crew_members')
      .select('name, phone')
      .eq('id', crewMemberId)
      .single();

    if (error || !crewMember) {
      throw new Error('Crew member not found');
    }

    return await sendTemplatedNotification(
      'JOB_ASSIGNMENT',
      'crew_member',
      crewMemberId,
      {
        crew_name: crewMember.name,
        job_number: jobDetails.job_number,
        date: jobDetails.date,
        time: jobDetails.time,
        address: jobDetails.address,
        customer_name: jobDetails.customer_name
      },
      { jobId }
    );
  } catch (error: any) {
    console.error('Error notifying job assignment:', error);
    return { success: false, error: error.message };
  }
}

// Schedule change notification
export async function notifyScheduleChange(
  jobId: string,
  changeType: 'rescheduled' | 'cancelled' | 'moved',
  newDetails: {
    job_number: string;
    new_date: string;
    new_time: string;
    address: string;
  }
) {
  try {
    // Get assigned crew members
    const { data: assignments, error } = await supabase
      .from('job_assignments')
      .select(`
        crew_member_id,
        crew_member:crew_members(name, phone)
      `)
      .eq('job_id', jobId);

    if (error) throw error;

    const notifications = [];
    for (const assignment of assignments || []) {
      const result = await sendTemplatedNotification(
        'SCHEDULE_CHANGE',
        'crew_member',
        assignment.crew_member_id,
        {
          job_number: newDetails.job_number,
          change_type: changeType,
          new_date: newDetails.new_date,
          new_time: newDetails.new_time,
          address: newDetails.address
        },
        { jobId, priority: 2 }
      );
      notifications.push(result);
    }

    return { success: true, data: notifications };
  } catch (error: any) {
    console.error('Error notifying schedule change:', error);
    return { success: false, error: error.message };
  }
}

// Weather alert notification
export async function notifyWeatherAlert(
  jobId: string,
  weatherCondition: string,
  scheduledDate: string
) {
  try {
    // Get job details and assigned crew
    const { data: job, error: jobError } = await supabase
      .from('jobs')
      .select(`
        job_number,
        job_assignments:job_assignments(
          crew_member_id,
          crew_member:crew_members(name, phone)
        )
      `)
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      throw new Error('Job not found');
    }

    const notifications = [];
    for (const assignment of job.job_assignments || []) {
      const result = await sendTemplatedNotification(
        'WEATHER_ALERT',
        'crew_member',
        assignment.crew_member_id,
        {
          job_number: job.job_number,
          date: scheduledDate,
          weather_condition: weatherCondition
        },
        { jobId, priority: 2 }
      );
      notifications.push(result);
    }

    return { success: true, data: notifications };
  } catch (error: any) {
    console.error('Error notifying weather alert:', error);
    return { success: false, error: error.message };
  }
}

// Customer update notification
export async function notifyCustomerUpdate(
  jobId: string,
  statusMessage: string,
  completionTime: string
) {
  try {
    // Get job and customer details
    const { data: job, error } = await supabase
      .from('jobs')
      .select(`
        job_number,
        customer:customers(name, phone)
      `)
      .eq('id', jobId)
      .single();

    if (error || !job) {
      throw new Error('Job not found');
    }

    if (!job.customer?.phone) {
      throw new Error('Customer phone number not available');
    }

    return await sendTemplatedNotification(
      'CUSTOMER_UPDATE',
      'customer',
      job.customer.phone,
      {
        customer_name: job.customer.name,
        job_number: job.job_number,
        status_message: statusMessage,
        completion_time: completionTime,
        company_phone: '(555) 123-4567' // TODO: Get from company settings
      },
      { jobId, priority: 3 }
    );
  } catch (error: any) {
    console.error('Error notifying customer update:', error);
    return { success: false, error: error.message };
  }
}

// Daily job reminders
export async function sendDailyJobReminders() {
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    // Get jobs scheduled for tomorrow
    const { data: jobs, error } = await supabase
      .from('jobs')
      .select(`
        id,
        job_number,
        start_time,
        address,
        customer:customers(name),
        job_assignments:job_assignments(
          crew_member_id,
          crew_member:crew_members(name, phone)
        ),
        job_equipment:job_equipment(
          equipment:equipment(name)
        )
      `)
      .eq('scheduled_date', tomorrowStr)
      .in('status', ['scheduled', 'dispatched']);

    if (error) throw error;

    const notifications = [];
    for (const job of jobs || []) {
      const equipmentList = job.job_equipment
        ?.map(je => je.equipment?.name)
        .filter(Boolean)
        .join(', ') || 'TBD';

      for (const assignment of job.job_assignments || []) {
        const result = await sendTemplatedNotification(
          'JOB_REMINDER',
          'crew_member',
          assignment.crew_member_id,
          {
            job_number: job.job_number,
            time: job.start_time || '8:00 AM',
            address: job.address,
            customer_name: job.customer?.name || 'Unknown',
            equipment: equipmentList
          },
          { jobId: job.id, priority: 3 }
        );
        notifications.push(result);
      }
    }

    return { success: true, data: notifications };
  } catch (error: any) {
    console.error('Error sending daily job reminders:', error);
    return { success: false, error: error.message };
  }
}

// Process notification queue (would be called by a background job)
export async function processNotificationQueue() {
  try {
    // Get pending notifications ready to send
    const { data: notifications, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('status', 'pending')
      .lte('send_at', new Date().toISOString())
      .lt('attempts', 3)
      .order('priority')
      .order('send_at')
      .limit(50);

    if (error) throw error;

    const results = [];
    for (const notification of notifications || []) {
      const result = await sendNotification(notification);
      results.push(result);
    }

    return { success: true, data: results };
  } catch (error: any) {
    console.error('Error processing notification queue:', error);
    return { success: false, error: error.message };
  }
}

// Send individual notification (placeholder - integrate with SMS/email service)
async function sendNotification(notification: any) {
  try {
    // Update attempt count
    await supabase
      .from('notification_queue')
      .update({
        attempts: notification.attempts + 1
      })
      .eq('id', notification.id);

    // For demo purposes, log the notification
    console.log('Sending notification:', {
      type: notification.message_type,
      to: notification.recipient_id,
      message: notification.message
    });

    // TODO: Integrate with actual SMS/email service (Twilio, SendGrid, etc.)
    // For now, mark as sent
    const status = Math.random() > 0.1 ? 'sent' : 'failed'; // 90% success rate for demo

    await supabase
      .from('notification_queue')
      .update({
        status: status,
        sent_at: status === 'sent' ? new Date().toISOString() : null,
        error_message: status === 'failed' ? 'Demo failure' : null
      })
      .eq('id', notification.id);

    return { success: status === 'sent', notification_id: notification.id };
  } catch (error: any) {
    console.error('Error sending notification:', error);

    // Mark as failed
    await supabase
      .from('notification_queue')
      .update({
        status: 'failed',
        error_message: error.message
      })
      .eq('id', notification.id);

    return { success: false, error: error.message };
  }
}

// Get notification history for a user
export async function getNotificationHistory(
  recipientType: string,
  recipientId: string,
  limit: number = 50
) {
  try {
    const { data, error } = await supabase
      .from('notification_queue')
      .select('*')
      .eq('recipient_type', recipientType)
      .eq('recipient_id', recipientId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return { success: true, data: data || [] };
  } catch (error: any) {
    console.error('Error getting notification history:', error);
    return { success: false, error: error.message, data: [] };
  }
}

// Update notification preferences
export async function updateNotificationPreferences(
  crewMemberId: string,
  preferences: Partial<NotificationPreferences>
) {
  try {
    const { data, error } = await supabase
      .from('notification_preferences')
      .upsert({
        crew_member_id: crewMemberId,
        ...preferences,
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return { success: true, data };
  } catch (error: any) {
    console.error('Error updating notification preferences:', error);
    return { success: false, error: error.message };
  }
}

export default {
  queueNotification,
  sendTemplatedNotification,
  notifyJobAssignment,
  notifyScheduleChange,
  notifyWeatherAlert,
  notifyCustomerUpdate,
  sendDailyJobReminders,
  processNotificationQueue,
  getNotificationHistory,
  updateNotificationPreferences
};