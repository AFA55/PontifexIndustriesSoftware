/**
 * Customer notification helper.
 *
 * Notifies the CUSTOMER (the site contact on a job) at two lifecycle moments:
 *   - 'en_route'  — the operator tapped "In Route" (crew on the way)
 *   - 'completed' — the job was marked complete
 *
 * Each notification:
 *   1. Resolves the customer's email + phone from the job_orders row.
 *   2. Gets-or-creates a `customer_portal_tokens` magic-link (reusing the SAME
 *      portal model the admin "portal links" feature uses) and builds the
 *      `/portal/[token]` URL.
 *   3. Sends a white-label email (always, if an email is present).
 *   4. Sends a best-effort SMS via lib/sms.ts (no-op/safe when SMS isn't
 *      configured — Twilio toll-free verification is still pending).
 *
 * Usage: fire-and-forget. NEVER throws into the caller.
 *
 *   notifyCustomer({ event: 'en_route', job }).catch(() => {});
 */

import {
  sendEmail,
  getTenantEmailBranding,
  generateCustomerEnRouteEmail,
  generateCustomerJobCompleteEmail,
} from '@/lib/email';
import { sendSMSAny } from '@/lib/sms';
import { getOrCreatePortalTokenForJob, buildPortalUrl } from '@/lib/portal-tokens';

export type CustomerNotifyEvent = 'en_route' | 'completed';

/** The minimal subset of a job_orders row this helper needs. */
export interface CustomerNotifyJob {
  id: string;
  tenant_id?: string | null;
  customer_name?: string | null;
  customer_email?: string | null;
  /** Phone columns vary on job_orders; the caller may pass any of these. */
  site_contact_phone?: string | null;
  foreman_phone?: string | null;
  customer_contact?: string | null;
  job_number?: string | null;
  address?: string | null;
  location?: string | null;
}

export interface NotifyCustomerArgs {
  event: CustomerNotifyEvent;
  job: CustomerNotifyJob;
  /** The user who triggered the transition (recorded as the token creator). */
  triggeredBy?: string | null;
}

/** First non-empty trimmed string from the list, or null. */
function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/**
 * Notify the customer for a job lifecycle event. Fire-and-forget; never throws.
 *
 * No-ops silently when there's no tenant context or no customer email/phone.
 */
export async function notifyCustomer(args: NotifyCustomerArgs): Promise<void> {
  try {
    const { job, event } = args;
    const tenantId = job.tenant_id || null;
    if (!tenantId) return; // can't scope a portal token without a tenant

    const customerEmail = firstNonEmpty(job.customer_email);
    const customerPhone = firstNonEmpty(job.site_contact_phone, job.foreman_phone);

    // Nothing to send to — don't create a token or notification.
    if (!customerEmail && !customerPhone) return;

    const customerName = firstNonEmpty(job.customer_name, job.customer_contact) || 'there';
    const jobAddress = firstNonEmpty(job.address, job.location);
    const jobNumber = firstNonEmpty(job.job_number);

    // Get-or-create the portal magic-link for this job's customer.
    const portalToken = await getOrCreatePortalTokenForJob({
      tenantId,
      jobOrderId: job.id,
      customerName,
      customerEmail,
      customerPhone,
      createdBy: args.triggeredBy || null,
    });

    if (!portalToken) return; // couldn't mint a link — nothing to send

    const portalUrl = buildPortalUrl(portalToken.token);

    // ── Email (always, when present) ─────────────────────────────────────────
    if (customerEmail) {
      try {
        const branding = await getTenantEmailBranding(tenantId);
        const html =
          event === 'en_route'
            ? await generateCustomerEnRouteEmail({
                branding,
                customerName,
                jobAddress,
                jobNumber,
                portalUrl,
              })
            : await generateCustomerJobCompleteEmail({
                branding,
                customerName,
                jobAddress,
                jobNumber,
                portalUrl,
              });

        const subject =
          event === 'en_route'
            ? `Your crew is on the way — ${branding.companyName}`
            : `Your job is complete — ${branding.companyName}`;

        await sendEmail({ to: customerEmail, subject, html });
      } catch (err) {
        // Email is best-effort — log, never block.
        console.warn('[notify-customer] email failed:', err);
      }
    }

    // ── SMS (best-effort; safe no-op when unconfigured) ──────────────────────
    // sendSMSAny returns { success:false } when no provider is configured and
    // does not throw; we still wrap defensively so a failed SMS NEVER blocks
    // the status change or the email above. (Twilio toll-free verification is
    // still pending — this stays dormant until a provider is configured.)
    if (customerPhone) {
      try {
        // Resolve a company name for the SMS prefix without a second branding
        // lookup if we already have one isn't worth the complexity — fetch fresh.
        const branding = await getTenantEmailBranding(tenantId);
        const company = branding.companyName;
        const message =
          event === 'en_route'
            ? `${company}: Hi ${customerName}, your crew is on the way${
                jobNumber ? ` for ${jobNumber}` : ''
              }. Track your job: ${portalUrl}`
            : `${company}: Hi ${customerName}, your job${
                jobNumber ? ` ${jobNumber}` : ''
              } is complete. View documents & sign: ${portalUrl}`;

        await sendSMSAny({ to: customerPhone, message, jobId: job.id, tenantId, source: 'customer_status_sms' });
      } catch (err) {
        // SMS is best-effort — log, never block.
        console.warn('[notify-customer] sms failed:', err);
      }
    }
  } catch {
    // Top-level safety net — never throw from this helper.
  }
}
