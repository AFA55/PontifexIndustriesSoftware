/**
 * Unified notification/reminder dispatcher.
 *
 * One call delivers across every enabled channel for a user + category:
 *   1. In-app  — always written to the `notifications` table (the bell)
 *   2. Push    — native APNs/FCM if the user has push enabled + a device token
 *   3. SMS     — Telnyx/Twilio if the user has SMS enabled + a phone is provided
 *
 * Channel choice respects each user's `notification_preferences` row for the
 * category. If no preference row exists, defaults are: push ON, sms OFF,
 * email OFF (sensible default — push is free + primary).
 *
 * For timed reminders (clock-in, work-performed) use `sendReminderOnce`, which
 * adds idempotent dedup via the reminder_log table so a reminder fires at most
 * once per user per key (e.g. once per day).
 */

import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendPushToUser } from '@/lib/send-push';
import { sendSMSAny } from '@/lib/sms';
import { sendEmail, generateNotificationEmail, getTenantEmailBranding } from '@/lib/email';

export type NotificationCategory =
  | 'clock_in_reminder'
  | 'work_performed_reminder'
  | 'time_off_status'
  | 'job_dispatched'
  | 'document_to_sign'
  | 'maintenance_update'
  | 'general';

export interface ReminderOptions {
  userId: string;
  tenantId?: string | null;
  category: NotificationCategory;
  title: string;
  message: string;
  /** in-app notification.type (visual tone). Defaults to 'info'. */
  inAppType?: string;
  jobOrderId?: string;
  /** Phone number for SMS fallback (only used if user has SMS enabled). */
  smsPhone?: string | null;
  /** Deep-link route delivered in push data + stored as action_url. */
  actionUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface DeliveryResult {
  inApp: boolean;
  push: boolean;
  sms: boolean;
  email: boolean;
}

interface Prefs { push_enabled: boolean; sms_enabled: boolean; email_enabled: boolean; }

async function getPrefs(userId: string, category: NotificationCategory): Promise<Prefs> {
  const { data } = await supabaseAdmin
    .from('notification_preferences')
    .select('push_enabled, sms_enabled, email_enabled')
    .eq('user_id', userId)
    .eq('category', category)
    .maybeSingle();
  // Default: push on, sms/email off
  return {
    push_enabled: data?.push_enabled ?? true,
    sms_enabled: data?.sms_enabled ?? false,
    email_enabled: data?.email_enabled ?? false,
  };
}

/**
 * Deliver a notification across all enabled channels for the user.
 */
export async function sendNotification(opts: ReminderOptions): Promise<DeliveryResult> {
  const prefs = await getPrefs(opts.userId, opts.category);
  const result: DeliveryResult = { inApp: false, push: false, sms: false, email: false };

  // 1. In-app — always (the bell). Uses the `notifications` table.
  try {
    await supabaseAdmin.from('notifications').insert({
      user_id: opts.userId,
      tenant_id: opts.tenantId ?? null,
      type: opts.inAppType || 'info',
      notification_type: opts.category,
      title: opts.title,
      message: opts.message,
      action_url: opts.actionUrl ?? null,
      related_entity_type: opts.jobOrderId ? 'job_order' : null,
      related_entity_id: opts.jobOrderId ?? null,
      metadata: opts.metadata ?? {},
      read: false,
      is_read: false,
    });
    result.inApp = true;
  } catch (e) {
    console.warn('[reminder] in-app insert failed:', e);
  }

  // 2. Push — if enabled
  if (prefs.push_enabled) {
    try {
      const push = await sendPushToUser(opts.userId, {
        title: opts.title,
        body: opts.message,
        data: opts.actionUrl ? { route: opts.actionUrl } : undefined,
      });
      result.push = push.sent > 0;
    } catch (e) {
      console.warn('[reminder] push failed:', e);
    }
  }

  // 3. SMS — if enabled and a phone is available
  if (prefs.sms_enabled && opts.smsPhone) {
    try {
      const sms = await sendSMSAny({ to: opts.smsPhone, message: `${opts.title}: ${opts.message}` });
      result.sms = sms.success;
    } catch (e) {
      console.warn('[reminder] sms failed:', e);
    }
  }

  // 4. Email — if enabled. Look up the user's email, send a plain branded note.
  if (prefs.email_enabled) {
    try {
      const { data: prof } = await supabaseAdmin
        .from('profiles')
        .select('email')
        .eq('id', opts.userId)
        .maybeSingle();
      if (prof?.email) {
        const branding = await getTenantEmailBranding(opts.tenantId ?? null);
        result.email = await sendEmail({
          to: prof.email,
          subject: opts.title,
          html: generateNotificationEmail({
            title: opts.title,
            message: opts.message,
            actionUrl: opts.actionUrl,
            branding,
          }),
        });
      }
    } catch (e) {
      console.warn('[reminder] email failed:', e);
    }
  }

  return result;
}

/**
 * Idempotent reminder: sends only if (userId, reminderKey) hasn't fired yet.
 * Uses the reminder_log UNIQUE constraint as the dedup guard — safe under
 * concurrent cron invocations. Returns null if it was a duplicate (skipped).
 */
export async function sendReminderOnce(
  reminderKey: string,
  opts: ReminderOptions
): Promise<DeliveryResult | null> {
  // Claim the dedup slot first. If it already exists, this errors → skip.
  const { error } = await supabaseAdmin
    .from('reminder_log')
    .insert({ user_id: opts.userId, reminder_key: reminderKey });

  if (error) {
    // Unique violation = already sent. Any other error → also skip to be safe.
    return null;
  }

  return sendNotification(opts);
}
