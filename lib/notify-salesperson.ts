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
import {
  sendEmail,
  getTenantEmailBranding,
  generateSalespersonNotificationEmail,
} from '@/lib/email';
import { sendPushToUser } from '@/lib/send-push';
import { resolveAppOrigin } from '@/lib/app-url';

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

    // Parallel native push — fire-and-forget, never blocks or throws.
    // Mirrors the in-app row above; the bespoke notifications row shape is
    // left untouched.
    sendPushToUser(args.recipientUserId, {
      title,
      body: message,
      data: { route: action_url },
    }).catch(() => {});

    // Best-effort email — look up auth user email; never block on failure.
    try {
      const { data: userResult } = await supabaseAdmin.auth.admin.getUserById(args.recipientUserId);
      const email = userResult?.user?.email;
      if (email) {
        const branding = await getTenantEmailBranding(args.tenantId || null);
        const appUrl = resolveAppOrigin();
        const html = await generateSalespersonNotificationEmail({
          branding,
          title,
          message,
          actionUrl: action_url ? encodeURI(`${appUrl}${action_url}`) : undefined,
        });
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
