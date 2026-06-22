export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import {
  sendEmail,
  getTenantEmailBranding,
  generateOperatorScheduleEmail,
  type EmailBranding,
} from '@/lib/email';
import { resolveAppOrigin } from '@/lib/app-url';

interface JobOrder {
  id: string;
  job_number: string;
  title: string;
  customer_name: string;
  location: string;
  address: string;
  scheduled_date: string;
  arrival_time: string;
  shop_arrival_time: string;
  foreman_name: string;
  foreman_phone: string;
  description: string;
  equipment_needed: string[];
}

interface OperatorSchedule {
  operator_id: string;
  operator_name: string;
  operator_email: string;
  jobs: JobOrder[];
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Check if user is admin (any elevated role)
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role, tenant_id')
      .eq('id', user.id)
      .single();

    if (!['admin', 'super_admin', 'operations_manager'].includes(profile?.role || '')) {
      return NextResponse.json(
        { success: false, error: 'Forbidden - Admin access required' },
        { status: 403 }
      );
    }

    const { scheduled_date, operator_schedules } = await request.json();

    if (!scheduled_date || !operator_schedules || operator_schedules.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // White-label branding from the admin's tenant (operators share it).
    const branding = await getTenantEmailBranding(profile?.tenant_id || null);

    // Send email to each operator
    let sent_count = 0;
    const errors: string[] = [];

    for (const schedule of operator_schedules as OperatorSchedule[]) {
      try {
        await sendScheduleEmail(schedule, scheduled_date, branding);
        sent_count++;
      } catch (error) {
        console.error(`Failed to send email to ${schedule.operator_email}:`, error);
        errors.push(`${schedule.operator_name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({
      success: true,
      sent_count,
      total: operator_schedules.length,
      errors: errors.length > 0 ? errors : undefined
    });

  } catch (error) {
    console.error('Error sending schedules:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function sendScheduleEmail(
  schedule: OperatorSchedule,
  scheduled_date: string,
  branding: EmailBranding
) {
  const formatTime = (time: string) => {
    if (!time) return 'Not set';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Get the earliest shop arrival time
  const earliestShopTime = schedule.jobs.reduce((earliest, job) => {
    if (!job.shop_arrival_time) return earliest;
    if (!earliest || job.shop_arrival_time < earliest) return job.shop_arrival_time;
    return earliest;
  }, '');

  const html = await generateOperatorScheduleEmail({
    branding,
    operatorName: schedule.operator_name,
    scheduleDateLabel: formatDate(scheduled_date),
    earliestShopTimeLabel: earliestShopTime ? formatTime(earliestShopTime) : null,
    scheduleUrl: `${resolveAppOrigin()}/dashboard/job-schedule`,
    jobs: schedule.jobs.map((job) => ({
      jobNumber: job.job_number,
      title: job.title,
      customerName: job.customer_name,
      location: job.location,
      address: job.address,
      shopArrivalTime: job.shop_arrival_time ? formatTime(job.shop_arrival_time) : null,
      arrivalTime: job.arrival_time ? formatTime(job.arrival_time) : null,
      foremanName: job.foreman_name,
      foremanPhone: job.foreman_phone,
      description: job.description,
      equipmentNeeded: job.equipment_needed,
    })),
  });

  await sendEmail({
    to: schedule.operator_email,
    subject: `📅 Your Schedule for ${formatDate(scheduled_date)}`,
    html,
  });
}
