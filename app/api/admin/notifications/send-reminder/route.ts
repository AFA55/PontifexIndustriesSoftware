export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/notifications/send-reminder
 * Send clock-in reminder to operators who haven't clocked in.
 * Accepts: { user_ids: string[] }
 * Creates notification with type 'clock_in_reminder' and bypass NFC action URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import {
  sendEmail,
  getTenantEmailBranding,
  generateClockInReminderEmail as buildClockInReminderEmail,
} from '@/lib/email';
import { resolveAppOrigin } from '@/lib/app-url';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { user_ids } = body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json({ error: 'user_ids array is required' }, { status: 400 });
    }

    const actionUrl = '/dashboard/timecard?bypass_nfc=true';
    const title = 'Clock-In Reminder';
    const message = 'You have not clocked in yet today. Please clock in as soon as possible. If you are unable to use NFC, use the link below to clock in remotely.';

    // Create notification records
    const notifications = user_ids.map((userId: string) => ({
      user_id: userId,
      sender_id: auth.userId,
      tenant_id: auth.tenantId || null,
      type: 'clock_in_reminder',
      notification_type: 'clock_in_reminder',
      title,
      message,
      action_url: actionUrl,
      bypass_nfc: true,
      is_read: false,
      read: false,
      is_email_sent: false,
      priority: 'high',
      metadata: { sent_by: auth.userEmail, reminder_type: 'clock_in' },
    }));

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert(notifications)
      .select('id, user_id');

    if (error) {
      console.error('Error creating reminder notifications:', error);
      return NextResponse.json({ error: 'Failed to send reminders' }, { status: 500 });
    }

    // Send emails to each user — white-labeled from the admin's tenant.
    let emailsSent = 0;
    const branding = await getTenantEmailBranding(auth.tenantId || null);
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .in('id', user_ids);

    if (profiles) {
      for (const profile of profiles) {
        if (profile.email) {
          const appUrl = resolveAppOrigin();
          const fullActionUrl = `${appUrl}${actionUrl}`;
          const emailHtml = await buildClockInReminderEmail({
            branding,
            name: profile.full_name || 'Team Member',
            actionUrl: fullActionUrl,
          });
          const sent = await sendEmail({
            to: profile.email,
            subject: `Clock-In Reminder — ${branding.companyName}`,
            html: emailHtml,
          });
          if (sent) {
            emailsSent++;
            // Mark email as sent on the notification
            const notif = data?.find((n: { user_id: string }) => n.user_id === profile.id);
            if (notif) {
              await supabaseAdmin
                .from('notifications')
                .update({ is_email_sent: true })
                .eq('id', notif.id);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        reminders_sent: data?.length || 0,
        emails_sent: emailsSent,
      },
    });
  } catch (error) {
    console.error('Unexpected error in send-reminder POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

