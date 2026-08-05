/**
 * Liability / utility waiver dispatch.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The schedule form has a "requires waiver signature" checkbox, `job_orders`
 * has the columns to record a signed waiver, and `/sign/[token]` can already
 * render and capture one. Nothing ever CONNECTED them: in production 4 jobs
 * required a waiver, 11 jobs went In Route, and ZERO waivers had ever been
 * signed. The checkbox recorded an intention nobody acted on.
 *
 * This is the missing link. When the crew first taps In Route on a job that
 * requires a waiver, the site contact gets the signing link — before anyone is
 * standing on the slab with a saw.
 *
 * ── Design notes ─────────────────────────────────────────────────────────────
 * • IDEMPOTENT. Re-sending reuses the existing unsigned request (same token, so
 *   a link already in someone's texts keeps working) and only re-delivers it.
 *   A second In Route tap must not mint a second document.
 * • NEVER THROWS. Dispatch is fire-and-forget from the status route — a waiver
 *   send failing must not stop an operator from going In Route.
 * • The RESULT IS REPORTED, not assumed. `sendWaiver` returns what actually
 *   happened (sent / already signed / no contact / failed) so the operator's
 *   screen can say "we couldn't reach them" instead of implying success.
 */

import crypto from 'crypto';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendEmail, getTenantEmailBranding, emailHeader } from '@/lib/email';
import { sendSMSAny } from '@/lib/sms';
import { resolveAppOrigin } from '@/lib/app-url';

/** The sign page keys its waiver rendering off this exact value. */
export const WAIVER_REQUEST_TYPE = 'utility_waiver';

/** How long a waiver link stays valid. Long enough for a multi-day job. */
const WAIVER_TTL_DAYS = 30;

export type WaiverDispatchOutcome =
  | 'sent'
  | 'already_signed'
  | 'not_required'
  | 'no_contact'
  | 'job_not_found'
  | 'failed';

export interface WaiverDispatchResult {
  outcome: WaiverDispatchOutcome;
  /** The signing URL, when a request exists (sent or previously sent). */
  url?: string;
  /** Where it actually went — empty when nothing could be delivered. */
  deliveredTo: { email?: string; sms?: string };
  /** Human-readable, safe to show an operator. */
  message: string;
}

interface WaiverJobRow {
  id: string;
  tenant_id: string | null;
  job_number: string | null;
  customer_name: string | null;
  customer_email: string | null;
  customer_contact: string | null;
  site_contact_phone: string | null;
  foreman_name: string | null;
  foreman_phone: string | null;
  address: string | null;
  location: string | null;
  require_waiver_signature: boolean | null;
  utility_waiver_signed: boolean | null;
}

const JOB_COLUMNS =
  'id, tenant_id, job_number, customer_name, customer_email, customer_contact, ' +
  'site_contact_phone, foreman_name, foreman_phone, address, location, ' +
  'require_waiver_signature, utility_waiver_signed';

function firstNonEmpty(...vals: Array<string | null | undefined>): string | null {
  for (const v of vals) if (typeof v === 'string' && v.trim()) return v.trim();
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string)
  );
}

// ─── Status (read-only) ──────────────────────────────────────────────────────

export interface WaiverStatus {
  required: boolean;
  signed: boolean;
  signed_at: string | null;
  signer_name: string | null;
  /** True once a request exists, so the UI can offer "Resend" vs "Send". */
  request_sent: boolean;
  sent_at: string | null;
  url: string | null;
}

/**
 * What the operator's screen needs to know before starting work: does this job
 * need a waiver, has it been signed, and if not, was it even sent?
 */
export async function getWaiverStatus(
  jobId: string,
  tenantId: string | null | undefined
): Promise<WaiverStatus | null> {
  let q = supabaseAdmin
    .from('job_orders')
    .select(
      'id, require_waiver_signature, utility_waiver_signed, utility_waiver_signed_at, utility_waiver_signer_name'
    )
    .eq('id', jobId);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data: job } = await q.maybeSingle();
  if (!job) return null;

  const { data: req } = await supabaseAdmin
    .from('signature_requests')
    .select('token, sent_at, signed_at, signer_name')
    .eq('job_order_id', jobId)
    .eq('request_type', WAIVER_REQUEST_TYPE)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // The job row is authoritative for "signed", but a signed signature_request
  // that never made it back onto the job still counts — the customer DID sign.
  const signed = !!job.utility_waiver_signed || !!req?.signed_at;

  return {
    required: !!job.require_waiver_signature,
    signed,
    signed_at: job.utility_waiver_signed_at ?? req?.signed_at ?? null,
    signer_name: job.utility_waiver_signer_name ?? req?.signer_name ?? null,
    request_sent: !!req,
    sent_at: req?.sent_at ?? null,
    url: req?.token ? `${resolveAppOrigin()}/sign/${req.token}` : null,
  };
}

// ─── Dispatch ────────────────────────────────────────────────────────────────

export interface SendWaiverArgs {
  jobId: string;
  tenantId?: string | null;
  triggeredBy?: string | null;
  /**
   * 'in_route'  — automatic, on the crew's first In Route tap
   * 'manual'    — an operator or the office pressed "Resend waiver"
   * 'reminder'  — the unsigned-waiver reminder sweep
   */
  reason: 'in_route' | 'manual' | 'reminder';
}

/**
 * Send (or re-send) the waiver for a job. Safe to call repeatedly.
 */
export async function sendWaiver(args: SendWaiverArgs): Promise<WaiverDispatchResult> {
  const { jobId, tenantId, triggeredBy, reason } = args;
  const none = { deliveredTo: {} as { email?: string; sms?: string } };

  try {
    let jobQuery = supabaseAdmin.from('job_orders').select(JOB_COLUMNS).eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: jobRow } = await jobQuery.maybeSingle();
    const job = jobRow as WaiverJobRow | null;

    if (!job) {
      return { ...none, outcome: 'job_not_found', message: 'Job not found.' };
    }
    // A manual resend is allowed to override the checkbox — the office may
    // decide on the day that they want one. Automatic sends respect it.
    if (!job.require_waiver_signature && reason !== 'manual') {
      return { ...none, outcome: 'not_required', message: 'This job does not require a waiver.' };
    }
    if (job.utility_waiver_signed) {
      return { ...none, outcome: 'already_signed', message: 'The waiver is already signed.' };
    }

    const email = firstNonEmpty(job.customer_email);
    const phone = firstNonEmpty(job.site_contact_phone, job.foreman_phone);
    const contactName = firstNonEmpty(
      job.customer_contact,
      job.foreman_name,
      job.customer_name
    );

    if (!email && !phone) {
      return {
        ...none,
        outcome: 'no_contact',
        message:
          'No email or phone on file for the site contact — the waiver could not be sent. Add one to the job, or have them sign in person.',
      };
    }

    // ── Get or create the request (idempotent) ────────────────────────────
    const { data: existing } = await supabaseAdmin
      .from('signature_requests')
      .select('id, token, signed_at')
      .eq('job_order_id', jobId)
      .eq('request_type', WAIVER_REQUEST_TYPE)
      .is('signed_at', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let token = existing?.token as string | undefined;

    if (!token) {
      token = crypto.randomBytes(32).toString('hex');
      const { error: insertError } = await supabaseAdmin.from('signature_requests').insert({
        job_order_id: jobId,
        tenant_id: job.tenant_id,
        token,
        request_type: WAIVER_REQUEST_TYPE,
        status: 'sent',
        contact_name: contactName,
        contact_email: email,
        contact_phone: phone,
        sent_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + WAIVER_TTL_DAYS * 86400_000).toISOString(),
        created_by: triggeredBy ?? null,
      });
      if (insertError) {
        console.error('[waiver] could not create signature request:', insertError);
        return {
          ...none,
          outcome: 'failed',
          message: 'The waiver link could not be created. Tell the office.',
        };
      }
    } else {
      // Re-delivery of the SAME link — stamp the resend so the office can see it.
      await supabaseAdmin
        .from('signature_requests')
        .update({ sent_at: new Date().toISOString(), status: 'sent' })
        .eq('id', existing!.id);
    }

    const url = `${resolveAppOrigin()}/sign/${token}`;
    const delivered: { email?: string; sms?: string } = {};

    // ── Deliver ───────────────────────────────────────────────────────────
    const jobLabel = job.job_number ? `job ${job.job_number}` : 'your job';
    const site = firstNonEmpty(job.address, job.location);

    if (email) {
      try {
        const b = await getTenantEmailBranding(job.tenant_id);
        const company = escapeHtml(b.companyName);
        const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f1f5f9;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
${emailHeader(b, 'Signature needed before work begins')}
<tr><td style="padding:28px 40px 8px;">
  <p style="margin:0 0 14px;font-size:15px;color:#0f172a;">
    ${contactName ? `Hi ${escapeHtml(contactName)},` : 'Hello,'}
  </p>
  <p style="margin:0 0 14px;font-size:15px;color:#334155;line-height:1.6;">
    Our crew is on the way for ${escapeHtml(jobLabel)}${site ? ` at ${escapeHtml(site)}` : ''}.
    Before we can start cutting, we need your signature on the utility &amp; liability
    waiver — it confirms that embedded conduit, post-tension cable, rebar and
    other buried utilities have been located and marked.
  </p>
  <p style="margin:24px 0;text-align:center;">
    <a href="${url}" style="display:inline-block;background:${escapeHtml(b.brandColor)};color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:700;font-size:15px;">
      Review &amp; sign the waiver
    </a>
  </p>
  <p style="margin:0 0 8px;font-size:13px;color:#64748b;line-height:1.6;">
    It takes about a minute on your phone. If the button doesn't work, paste this
    into your browser:<br>
    <span style="color:#475569;word-break:break-all;">${url}</span>
  </p>
</td></tr>
<tr><td style="padding:16px 40px 32px;border-top:1px solid #e2e8f0;">
  <p style="margin:12px 0 0;font-size:12px;color:#94a3b8;">Sent by ${company}.</p>
</td></tr>
</table></td></tr></table></body></html>`;

        const ok = await sendEmail({
          to: email,
          subject: `Signature needed before we start — ${jobLabel}`,
          html,
        });
        if (ok) delivered.email = email;
      } catch (e) {
        console.error('[waiver] email send failed:', e);
      }
    }

    if (phone) {
      try {
        const res = await sendSMSAny({
          to: phone,
          message:
            `Our crew is heading to ${site || jobLabel}. ` +
            `Before we start cutting we need the utility & liability waiver signed: ${url}`,
        });
        if (res.success) delivered.sms = phone;
      } catch (e) {
        console.error('[waiver] SMS send failed:', e);
      }
    }

    const reached = [delivered.email && 'email', delivered.sms && 'text']
      .filter(Boolean)
      .join(' and ');

    if (!reached) {
      // The link exists and is valid — it just couldn't be delivered. Say so
      // plainly rather than reporting a send that never happened.
      return {
        outcome: 'failed',
        url,
        deliveredTo: delivered,
        message:
          'The waiver link was created but could not be delivered. Show this link to the site contact, or have them sign in person.',
      };
    }

    return {
      outcome: 'sent',
      url,
      deliveredTo: delivered,
      message: `Waiver sent by ${reached}${contactName ? ` to ${contactName}` : ''}.`,
    };
  } catch (error) {
    console.error('[waiver] unexpected dispatch failure:', error);
    return { ...none, outcome: 'failed', message: 'The waiver could not be sent.' };
  }
}
