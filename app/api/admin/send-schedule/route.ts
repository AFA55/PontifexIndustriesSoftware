import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';

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

    // Check if user is admin
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin') {
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

    // Send email to each operator
    let sent_count = 0;
    const errors: string[] = [];

    for (const schedule of operator_schedules as OperatorSchedule[]) {
      try {
        await sendScheduleEmail(schedule, scheduled_date);
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

async function sendScheduleEmail(schedule: OperatorSchedule, scheduled_date: string) {
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

  // Generate job list HTML
  const jobsHtml = schedule.jobs.map((job, index) => `
    <div style="background: #f8fafc; border-left: 4px solid #3b82f6; padding: 16px; margin-bottom: 16px; border-radius: 8px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 12px;">
        <h3 style="margin: 0; color: #1e293b; font-size: 18px;">
          <span style="background: #3b82f6; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px; margin-right: 8px;">
            #${index + 1}
          </span>
          ${job.title}
        </h3>
        <span style="color: #64748b; font-size: 14px;">${job.job_number}</span>
      </div>

      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; margin-bottom: 12px;">
        <div>
          <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">🏭 Shop Arrival Time</div>
          <div style="color: #059669; font-weight: 600; font-size: 16px;">${formatTime(job.shop_arrival_time)}</div>
        </div>
        <div>
          <div style="color: #64748b; font-size: 12px; margin-bottom: 4px;">🏗️ Job Site Arrival Time</div>
          <div style="color: #3b82f6; font-weight: 600; font-size: 16px;">${formatTime(job.arrival_time)}</div>
        </div>
      </div>

      <div style="margin-bottom: 8px;">
        <strong style="color: #475569;">📍 Location:</strong> ${job.location}
      </div>
      <div style="margin-bottom: 8px;">
        <strong style="color: #475569;">📫 Address:</strong> ${job.address}
      </div>
      <div style="margin-bottom: 8px;">
        <strong style="color: #475569;">🏢 Customer:</strong> ${job.customer_name}
      </div>
      ${job.foreman_name ? `
      <div style="margin-bottom: 8px;">
        <strong style="color: #475569;">👤 Contact:</strong> ${job.foreman_name} - ${job.foreman_phone}
      </div>
      ` : ''}
      ${job.description ? `
      <div style="margin-top: 12px; padding: 12px; background: white; border-radius: 6px;">
        <strong style="color: #475569;">📝 Description:</strong>
        <p style="margin: 8px 0 0 0; color: #64748b;">${job.description}</p>
      </div>
      ` : ''}
      ${job.equipment_needed && job.equipment_needed.length > 0 ? `
      <div style="margin-top: 12px;">
        <strong style="color: #475569;">🛠️ Equipment Needed:</strong>
        <div style="margin-top: 8px; display: flex; flex-wrap: wrap; gap: 6px;">
          ${job.equipment_needed.map(equip => `
            <span style="background: #e0e7ff; color: #3730a3; padding: 4px 12px; border-radius: 12px; font-size: 12px;">
              ${equip}
            </span>
          `).join('')}
        </div>
      </div>
      ` : ''}
    </div>
  `).join('');

  // Get the earliest shop arrival time
  const earliestShopTime = schedule.jobs.reduce((earliest, job) => {
    if (!job.shop_arrival_time) return earliest;
    if (!earliest || job.shop_arrival_time < earliest) return job.shop_arrival_time;
    return earliest;
  }, '');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Your Schedule for ${formatDate(scheduled_date)}</title>
    </head>
    <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f1f5f9;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <!-- Header -->
        <div style="background: linear-gradient(135deg, #3b82f6 0%, #6366f1 100%); color: white; padding: 32px; border-radius: 16px 16px 0 0; text-align: center;">
          <h1 style="margin: 0 0 8px 0; font-size: 28px;">📅 Your Schedule</h1>
          <p style="margin: 0; font-size: 18px; opacity: 0.9;">${formatDate(scheduled_date)}</p>
        </div>

        <!-- Main Content -->
        <div style="background: white; padding: 32px; border-radius: 0 0 16px 16px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <p style="margin: 0 0 24px 0; font-size: 16px; color: #475569;">
            Hi <strong>${schedule.operator_name}</strong>,
          </p>

          <p style="margin: 0 0 24px 0; font-size: 16px; color: #475569;">
            Here is your schedule for <strong>${formatDate(scheduled_date)}</strong>. You have <strong>${schedule.jobs.length}</strong> job${schedule.jobs.length !== 1 ? 's' : ''} scheduled.
          </p>

          ${earliestShopTime ? `
          <div style="background: #dcfce7; border: 2px solid #22c55e; padding: 16px; border-radius: 12px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 24px;">⏰</span>
              <div>
                <div style="color: #166534; font-weight: 600; font-size: 14px;">BE AT SHOP BY</div>
                <div style="color: #15803d; font-weight: 700; font-size: 24px;">${formatTime(earliestShopTime)}</div>
              </div>
            </div>
          </div>
          ` : ''}

          <h2 style="color: #1e293b; font-size: 20px; margin: 0 0 16px 0;">Your Jobs:</h2>

          ${jobsHtml}

          <!-- Preview Button -->
          <div style="text-align: center; margin: 32px 0;">
            <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard/job-schedule"
               style="display: inline-block; background: #3b82f6; color: white; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 600; font-size: 16px;">
              📱 View Full Schedule in App
            </a>
          </div>

          <div style="margin-top: 24px; padding-top: 24px; border-top: 2px solid #e2e8f0; color: #64748b; font-size: 14px;">
            <p style="margin: 0 0 8px 0;">
              <strong>Important Reminders:</strong>
            </p>
            <ul style="margin: 8px 0; padding-left: 20px;">
              <li>Review your equipment checklist before leaving the shop</li>
              <li>Confirm all equipment is loaded and ready</li>
              <li>Check job site address and contact information</li>
              <li>Notify dispatch of any delays or issues</li>
            </ul>
          </div>
        </div>

        <!-- Footer -->
        <div style="text-align: center; margin-top: 24px; color: #94a3b8; font-size: 12px;">
          <p style="margin: 0;">
            This is an automated message from Pontifex Industries.<br>
            Do not reply to this email.
          </p>
        </div>
      </div>
    </body>
    </html>
  `;

  const plainTextContent = `
Your Schedule for ${formatDate(scheduled_date)}

Hi ${schedule.operator_name},

Here is your schedule for ${formatDate(scheduled_date)}. You have ${schedule.jobs.length} job${schedule.jobs.length !== 1 ? 's' : ''} scheduled.

${earliestShopTime ? `⏰ BE AT SHOP BY: ${formatTime(earliestShopTime)}\n\n` : ''}

Your Jobs:
${schedule.jobs.map((job, index) => `
#${index + 1} - ${job.title} (${job.job_number})
  Shop Arrival: ${formatTime(job.shop_arrival_time)}
  Job Site Arrival: ${formatTime(job.arrival_time)}
  Location: ${job.location}
  Address: ${job.address}
  Customer: ${job.customer_name}
  ${job.foreman_name ? `Contact: ${job.foreman_name} - ${job.foreman_phone}` : ''}
  ${job.description ? `Description: ${job.description}` : ''}
`).join('\n')}

View your full schedule: ${process.env.NEXT_PUBLIC_APP_URL}/dashboard/job-schedule

Important Reminders:
- Review your equipment checklist before leaving the shop
- Confirm all equipment is loaded and ready
- Check job site address and contact information
- Notify dispatch of any delays or issues

---
This is an automated message from Pontifex Industries.
Do not reply to this email.
  `;

  await sendEmail({
    to: schedule.operator_email,
    subject: `📅 Your Schedule for ${formatDate(scheduled_date)}`,
    html: htmlContent
  });
}
