export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/job-orders/[id]/customer-survey
 *
 * Used by the on-site customer satisfaction flow (operator hands their device
 * to the customer at job completion). Saves the survey response and dispatches
 * the results to the JOB'S site-contact phone — NOT the operator's device —
 * unless the customer chooses email delivery.
 *
 * Auth: Bearer token (operator/admin who owns the device).
 * Tenant: scoped via getTenantId(); job lookup is tenant-filtered.
 *
 * Delivery channel:
 *   - send_to_email present  → email to customer
 *   - else if site_contact_phone present → SMS to that phone
 *   - else → log only (still saves the row)
 *
 * Both delivery dispatches are fire-and-forget so saving never blocks on them.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';
import { sendSMS, formatPhoneNumber } from '@/lib/sms';
import { sendEmail } from '@/lib/email';

interface SurveyBody {
  cleanliness_rating?: number;
  communication_rating?: number;
  operator_feedback_notes?: string;
  likely_to_use_again_rating?: number;
  send_to_email?: string;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const body = (await request.json()) as SurveyBody;

    const cleanliness = clampInt(body.cleanliness_rating, 1, 5);
    const communication = clampInt(body.communication_rating, 1, 5);
    const likelyAgain = clampInt(body.likely_to_use_again_rating, 1, 10);
    const notes = (body.operator_feedback_notes || '').trim() || null;
    const sendToEmail = (body.send_to_email || '').trim() || null;

    if (!cleanliness && !communication && !likelyAgain) {
      return NextResponse.json(
        { error: 'At least one rating is required' },
        { status: 400 }
      );
    }

    // Resolve tenant for the caller (super_admin may be null)
    const tenantId = await getTenantId(auth.userId);

    // Fetch job — tenant-filter when caller has a tenant
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, assigned_to, site_contact_phone, customer_contact, customer_name, tenant_id')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Compute overall rating as avg(cleanliness, communication) when both present
    let overall: number | null = null;
    if (cleanliness && communication) {
      overall = Math.round((cleanliness + communication) / 2);
    } else if (cleanliness || communication) {
      overall = cleanliness || communication;
    }

    // Decide delivery channel
    const sitePhone = (job.site_contact_phone || job.customer_contact || '').trim() || null;
    let deliveredTo: string | null = null;
    let deliveryChannel: 'email' | 'sms' | 'none' = 'none';

    if (sendToEmail) {
      deliveryChannel = 'email';
      deliveredTo = `email:${sendToEmail}`;
    } else if (sitePhone) {
      const formatted = formatPhoneNumber(sitePhone);
      if (formatted) {
        deliveryChannel = 'sms';
        deliveredTo = `sms:${formatted}`;
      }
    }

    // Insert survey row
    const insertPayload: Record<string, any> = {
      job_order_id: job.id,
      operator_id: job.assigned_to || null,
      cleanliness_rating: cleanliness,
      communication_rating: communication,
      overall_rating: overall,
      operator_feedback_notes: notes,
      likely_to_use_again_rating: likelyAgain,
      customer_email: sendToEmail,
      delivered_to: deliveredTo,
      tenant_id: job.tenant_id || tenantId || null,
    };

    const { data: surveyRow, error: insertError } = await supabaseAdmin
      .from('customer_surveys')
      .insert(insertPayload)
      .select('id')
      .single();

    if (insertError || !surveyRow) {
      console.error('Error saving customer survey:', insertError);
      return NextResponse.json(
        { error: 'Failed to save survey' },
        { status: 500 }
      );
    }

    // Update operator's running rating averages (fire-and-forget)
    if (job.assigned_to && (cleanliness || communication || overall)) {
      Promise.resolve(
        updateOperatorRatings(job.assigned_to, {
          cleanliness_rating: cleanliness || undefined,
          communication_rating: communication || undefined,
          overall_rating: overall || undefined,
        })
      ).catch(() => {});
    }

    // Dispatch delivery (fire-and-forget) — never blocks the save
    if (deliveryChannel === 'sms' && deliveredTo) {
      const phone = deliveredTo.replace(/^sms:/, '');
      const msg = buildSmsMessage({
        jobNumber: job.job_number,
        cleanliness,
        communication,
        likelyAgain,
      });
      Promise.resolve(sendSMS({ to: phone, message: msg, jobId: job.id }))
        .then(() => {})
        .catch(() => {});
    } else if (deliveryChannel === 'email' && sendToEmail) {
      const html = buildEmailHtml({
        jobNumber: job.job_number,
        customerName: job.customer_name || '',
        cleanliness,
        communication,
        likelyAgain,
        notes,
      });
      Promise.resolve(
        sendEmail({
          to: sendToEmail,
          subject: 'Thank you from Patriot Concrete Cutting',
          html,
        })
      )
        .then(() => {})
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        survey_id: surveyRow.id,
        delivered_to: deliveredTo,
      },
    });
  } catch (error: any) {
    console.error('Error in POST /api/job-orders/[id]/customer-survey:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/* ─── helpers ──────────────────────────────────────────── */

function clampInt(
  v: number | undefined,
  min: number,
  max: number
): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  if (n < min || n > max) return null;
  return n;
}

function buildSmsMessage({
  jobNumber,
  cleanliness,
  communication,
  likelyAgain,
}: {
  jobNumber: string;
  cleanliness: number | null;
  communication: number | null;
  likelyAgain: number | null;
}): string {
  const parts: string[] = [`Thanks for your feedback on JOB ${jobNumber}!`];
  const ratingBits: string[] = [];
  if (cleanliness) ratingBits.push(`cleanliness ${cleanliness}/5`);
  if (communication) ratingBits.push(`communication ${communication}/5`);
  if (likelyAgain) ratingBits.push(`likelihood to recommend ${likelyAgain}/10`);
  if (ratingBits.length) {
    parts.push(`You rated ${ratingBits.join(', ')}.`);
  }
  parts.push('We appreciate your business.');
  return parts.join(' ');
}

function buildEmailHtml({
  jobNumber,
  customerName,
  cleanliness,
  communication,
  likelyAgain,
  notes,
}: {
  jobNumber: string;
  customerName: string;
  cleanliness: number | null;
  communication: number | null;
  likelyAgain: number | null;
  notes: string | null;
}): string {
  const ratingRow = (label: string, val: number | null, max: number) =>
    val
      ? `<tr>
          <td style="padding:10px 0;color:#64748b;font-size:14px;border-top:1px solid #e2e8f0;">${label}</td>
          <td style="padding:10px 0;color:#0f172a;font-size:14px;font-weight:600;text-align:right;border-top:1px solid #e2e8f0;">${val} / ${max}</td>
        </tr>`
      : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank you from Patriot Concrete Cutting</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#f8fafc;color:#1e293b;">
  <table role="presentation" style="width:100%;border-collapse:collapse;background-color:#f8fafc;">
    <tr>
      <td style="padding:48px 20px;">
        <table role="presentation" style="max-width:600px;margin:0 auto;background-color:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.1);overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#7c3aed 0%,#4f46e5 100%);padding:40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:700;letter-spacing:-0.3px;">
                Thank you for your feedback
              </h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.9);font-size:14px;">
                Patriot Concrete Cutting &middot; Job ${escapeHtml(jobNumber)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">
                ${customerName ? `Hi <strong style="color:#0f172a;">${escapeHtml(customerName)}</strong>,` : 'Hi,'}
              </p>
              <p style="margin:0 0 24px;color:#475569;font-size:16px;line-height:1.6;">
                We appreciate you taking a moment to share how we did. Here's a copy of your feedback:
              </p>
              <table style="width:100%;border-collapse:collapse;background-color:#f8fafc;border-radius:8px;margin-bottom:24px;">
                <tr><td style="padding:0 20px;">
                  <table style="width:100%;border-collapse:collapse;">
                    ${ratingRow('Cleanliness', cleanliness, 5)}
                    ${ratingRow('Communication', communication, 5)}
                    ${ratingRow('Likely to use us again', likelyAgain, 10)}
                  </table>
                </td></tr>
              </table>
              ${
                notes
                  ? `<div style="background-color:#f5f3ff;border-left:3px solid #7c3aed;border-radius:4px;padding:16px 20px;margin-bottom:24px;">
                      <p style="margin:0 0 6px;color:#5b21b6;font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px;">Your notes</p>
                      <p style="margin:0;color:#312e81;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escapeHtml(notes)}</p>
                    </div>`
                  : ''
              }
              <p style="margin:0;color:#475569;font-size:15px;line-height:1.6;">
                Your comments help us improve every single day. Thank you for trusting Patriot Concrete Cutting.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background-color:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#64748b;font-size:13px;line-height:1.5;">
                <strong style="color:#475569;">Patriot Concrete Cutting</strong><br>
                Licensed &middot; Insured &middot; Professional
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function updateOperatorRatings(
  operatorId: string,
  survey: {
    cleanliness_rating?: number;
    communication_rating?: number;
    overall_rating?: number;
  }
) {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select(
        'cleanliness_rating_avg, cleanliness_rating_count, communication_rating_avg, communication_rating_count, overall_rating_avg, overall_rating_count, total_ratings_received'
      )
      .eq('id', operatorId)
      .single();

    if (!profile) return;

    const updates: Record<string, any> = {
      total_ratings_received: (profile.total_ratings_received || 0) + 1,
      last_rating_received_at: new Date().toISOString(),
    };

    if (survey.cleanliness_rating) {
      const oldAvg = profile.cleanliness_rating_avg || 0;
      const oldCount = profile.cleanliness_rating_count || 0;
      const newCount = oldCount + 1;
      updates.cleanliness_rating_avg = parseFloat(
        ((oldAvg * oldCount + survey.cleanliness_rating) / newCount).toFixed(2)
      );
      updates.cleanliness_rating_count = newCount;
    }

    if (survey.communication_rating) {
      const oldAvg = profile.communication_rating_avg || 0;
      const oldCount = profile.communication_rating_count || 0;
      const newCount = oldCount + 1;
      updates.communication_rating_avg = parseFloat(
        ((oldAvg * oldCount + survey.communication_rating) / newCount).toFixed(2)
      );
      updates.communication_rating_count = newCount;
    }

    if (survey.overall_rating) {
      const oldAvg = profile.overall_rating_avg || 0;
      const oldCount = profile.overall_rating_count || 0;
      const newCount = oldCount + 1;
      updates.overall_rating_avg = parseFloat(
        ((oldAvg * oldCount + survey.overall_rating) / newCount).toFixed(2)
      );
      updates.overall_rating_count = newCount;
    }

    await supabaseAdmin.from('profiles').update(updates).eq('id', operatorId);
  } catch (err) {
    console.error('Error updating operator ratings from survey:', err);
  }
}
