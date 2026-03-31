/**
 * POST /api/admin/notifications/send-reminder
 * Send clock-in reminder to operators who haven't clocked in.
 * Accepts: { user_ids: string[] }
 * Creates notification with type 'clock_in_reminder' and bypass NFC action URL.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { sendEmail } from '@/lib/email';

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

    // Send emails to each user
    let emailsSent = 0;
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, email, full_name')
      .in('id', user_ids);

    if (profiles) {
      for (const profile of profiles) {
        if (profile.email) {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
          const fullActionUrl = `${appUrl}${actionUrl}`;
          const emailHtml = generateClockInReminderEmail(
            profile.full_name || 'Team Member',
            fullActionUrl
          );
          const sent = await sendEmail({
            to: profile.email,
            subject: 'Clock-In Reminder - Patriot Concrete Cutting',
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

function generateClockInReminderEmail(name: string, actionUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Clock-In Reminder - Patriot Concrete Cutting</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 48px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #dc2626 0%, #f59e0b 100%); padding: 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Clock-In Reminder</h1>
              <p style="margin: 8px 0 0; color: rgba(255,255,255,0.9); font-size: 14px;">Patriot Concrete Cutting</p>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #475569; font-size: 16px;">Hi <strong>${name}</strong>,</p>
              <p style="margin: 0 0 24px; color: #475569; font-size: 16px; line-height: 1.6;">
                Our records show you have not clocked in yet today. Please clock in as soon as possible to ensure your hours are accurately recorded.
              </p>
              <div style="background-color: #fef3c7; border-left: 3px solid #f59e0b; border-radius: 4px; padding: 16px 20px; margin-bottom: 32px;">
                <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
                  <strong>Can't use NFC?</strong> Use the button below to clock in remotely. GPS location will still be captured.
                </p>
              </div>
              <table role="presentation" style="width: 100%; margin: 0 0 32px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${actionUrl}" style="display: inline-block; padding: 16px 48px; background-color: #dc2626; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">Clock In Now</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated reminder. Please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
