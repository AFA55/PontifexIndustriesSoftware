/**
 * POST /api/admin/notifications/send
 * Admin sends notification to one or more users.
 * Accepts: { user_ids: string[], title, message, type, action_url?, bypass_nfc? }
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
    const { user_ids, title, message, type, action_url, bypass_nfc, send_email } = body;

    if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
      return NextResponse.json({ error: 'user_ids array is required' }, { status: 400 });
    }

    if (!title || !message) {
      return NextResponse.json({ error: 'title and message are required' }, { status: 400 });
    }

    const notificationType = type || 'custom';

    // Create notification records for each user
    const notifications = user_ids.map((userId: string) => ({
      user_id: userId,
      sender_id: auth.userId,
      tenant_id: auth.tenantId || null,
      type: notificationType,
      notification_type: notificationType,
      title,
      message,
      action_url: action_url || null,
      bypass_nfc: bypass_nfc || false,
      is_read: false,
      read: false,
      is_email_sent: false,
      metadata: { sent_by: auth.userEmail },
    }));

    const { data, error } = await supabaseAdmin
      .from('notifications')
      .insert(notifications)
      .select('id, user_id');

    if (error) {
      console.error('Error creating notifications:', error);
      return NextResponse.json({ error: 'Failed to send notifications' }, { status: 500 });
    }

    // Send emails if requested
    let emailsSent = 0;
    if (send_email) {
      // Fetch user emails
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, email, full_name')
        .in('id', user_ids);

      if (profiles) {
        for (const profile of profiles) {
          if (profile.email) {
            const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
            const actionLink = action_url ? `${appUrl}${action_url}` : '';
            const emailHtml = generateNotificationEmail(
              profile.full_name || 'Team Member',
              title,
              message,
              actionLink
            );
            const sent = await sendEmail({
              to: profile.email,
              subject: title,
              html: emailHtml,
            });
            if (sent) {
              emailsSent++;
              // Mark email as sent
              await supabaseAdmin
                .from('notifications')
                .update({ is_email_sent: true })
                .eq('user_id', profile.id)
                .eq('sender_id', auth.userId)
                .order('created_at', { ascending: false })
                .limit(1);
            }
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        notifications_created: data?.length || 0,
        emails_sent: emailsSent,
      },
    });
  } catch (error) {
    console.error('Unexpected error in send notifications POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function generateNotificationEmail(name: string, title: string, message: string, actionUrl: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} - Patriot Concrete Cutting</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 48px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); padding: 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 700;">Patriot Concrete Cutting</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <p style="margin: 0 0 16px; color: #475569; font-size: 16px;">Hi <strong>${name}</strong>,</p>
              <h2 style="margin: 0 0 16px; color: #0f172a; font-size: 22px; font-weight: 700;">${title}</h2>
              <p style="margin: 0 0 32px; color: #475569; font-size: 16px; line-height: 1.6;">${message}</p>
              ${actionUrl ? `
              <table role="presentation" style="width: 100%; margin: 0 0 32px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${actionUrl}" style="display: inline-block; padding: 14px 40px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600;">Take Action</a>
                  </td>
                </tr>
              </table>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 24px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">This is an automated message. Please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
