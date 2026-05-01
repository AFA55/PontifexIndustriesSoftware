/**
 * Salesperson notification helper.
 *
 * Dispatches in-app notifications (and best-effort email) to the salesperson
 * who created a job order or invoice at key milestones in the job + billing
 * lifecycle.
 *
 * Usage: fire-and-forget. Never throws.
 *
 *   notifySalesperson({ event: 'job_active', ... }).catch(() => {});
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail } from '@/lib/email';

export type SalespersonEvent =
  | 'job_active'
  | 'job_completed'
  | 'invoice_ready'
  | 'invoice_paid'
  | 'invoice_unpaid_30d';

export interface NotifyArgs {
  event: SalespersonEvent;
  jobOrderId?: string;
  invoiceId?: string;
  recipientUserId: string;
  tenantId?: string | null;
  /** Job number or invoice number for the message body. */
  subjectName?: string;
  customerName?: string;
}

interface RenderedEvent {
  title: string;
  message: string;
  action_url: string;
}

function renderEvent(args: NotifyArgs): RenderedEvent {
  const subject = args.subjectName || (args.jobOrderId ? args.jobOrderId : args.invoiceId || '');
  const customer = args.customerName || 'the customer';
  const jobUrl = args.jobOrderId
    ? `/dashboard/admin/jobs/${args.jobOrderId}`
    : '/dashboard/admin/jobs';

  switch (args.event) {
    case 'job_active':
      return {
        title: 'Your job is now active 🟢',
        message: `JOB ${subject} for ${customer} has been started by the operator.`,
        action_url: jobUrl,
      };
    case 'job_completed':
      return {
        title: 'Your job is complete ✅',
        message: `JOB ${subject} for ${customer} was completed.`,
        action_url: '/dashboard/admin/completed-jobs',
      };
    case 'invoice_ready':
      return {
        title: `Invoice ready for ${subject} 🧾`,
        message: 'Invoice was created. Track status from billing.',
        action_url: '/dashboard/admin/billing',
      };
    case 'invoice_paid':
      return {
        title: 'Payment received 💰',
        message: `Invoice ${subject} for ${customer} has been marked paid.`,
        action_url: '/dashboard/admin/billing',
      };
    case 'invoice_unpaid_30d':
      return {
        title: 'Reminder: invoice unpaid 30+ days ⏰',
        message: `Invoice ${subject} for ${customer} has been outstanding for 30 days or more.`,
        action_url: '/dashboard/admin/billing',
      };
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function buildEmailHtml(title: string, message: string, actionUrl: string): string {
  const safeTitle = escapeHtml(title);
  const safeMessage = escapeHtml(message);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const link = actionUrl ? encodeURI(`${appUrl}${actionUrl}`) : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeTitle}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8fafc;">
  <table role="presentation" style="width: 100%; border-collapse: collapse; background-color: #f8fafc;">
    <tr>
      <td style="padding: 48px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); overflow: hidden;">
          <tr>
            <td style="background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%); padding: 32px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 22px; font-weight: 700;">Patriot Concrete Cutting</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 16px; color: #0f172a; font-size: 20px; font-weight: 700;">${safeTitle}</h2>
              <p style="margin: 0 0 28px; color: #475569; font-size: 16px; line-height: 1.6;">${safeMessage}</p>
              ${link ? `
              <table role="presentation" style="width: 100%; margin: 0 0 16px;">
                <tr>
                  <td style="text-align: center;">
                    <a href="${link}" style="display: inline-block; padding: 12px 32px; background-color: #7c3aed; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 15px; font-weight: 600;">Open in Dashboard</a>
                  </td>
                </tr>
              </table>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 20px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; color: #94a3b8; font-size: 12px;">Automated salesperson notification. Please do not reply.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Insert an in-app notification for the salesperson and best-effort email.
 *
 * Fire-and-forget — wraps the entire body in try/catch and never throws.
 */
export async function notifySalesperson(args: NotifyArgs): Promise<void> {
  try {
    if (!args.recipientUserId) return;

    const { title, message, action_url } = renderEvent(args);

    // Insert in-app notification row directly (no internal HTTP round-trip).
    try {
      await supabaseAdmin.from('notifications').insert({
        user_id: args.recipientUserId,
        sender_id: null,
        tenant_id: args.tenantId || null,
        type: args.event,
        notification_type: args.event,
        title,
        message,
        action_url,
        is_read: false,
        read: false,
        is_email_sent: false,
        metadata: {
          event: args.event,
          jobOrderId: args.jobOrderId || null,
          invoiceId: args.invoiceId || null,
        },
      });
    } catch {
      // swallow — fire-and-forget
    }

    // Best-effort email — look up auth user email; never block on failure.
    try {
      const { data: userResult } = await supabaseAdmin.auth.admin.getUserById(args.recipientUserId);
      const email = userResult?.user?.email;
      if (email) {
        const html = buildEmailHtml(title, message, action_url);
        // Don't await further inside fire-and-forget — but sendEmail returns
        // a promise we already wrap below. Awaiting here is fine since the
        // outer try/catch absorbs all errors.
        const sent = await sendEmail({ to: email, subject: title, html });
        if (sent) {
          // Best-effort: mark the latest matching row as emailed.
          try {
            await supabaseAdmin
              .from('notifications')
              .update({ is_email_sent: true })
              .eq('user_id', args.recipientUserId)
              .eq('type', args.event)
              .order('created_at', { ascending: false })
              .limit(1);
          } catch {
            // swallow
          }
        }
      }
    } catch {
      // swallow — email is optional
    }
  } catch {
    // Top-level safety net — never throw from this helper.
  }
}
