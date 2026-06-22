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
import { sendSMS, formatPhoneNumber } from '@/lib/sms';
import { sendEmail, getTenantEmailBranding, generateCustomerSurveyThankYouEmail } from '@/lib/email';

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

    // auth.tenantId is guaranteed non-null for non-super-admins by requireAuth();
    // super_admin intentionally has null and sees all tenants.
    const tenantId = auth.tenantId;

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
      const branding = await getTenantEmailBranding(job.tenant_id || tenantId || null);
      const html = await generateCustomerSurveyThankYouEmail({
        branding,
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
          subject: `Thank you from ${branding.companyName}`,
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
