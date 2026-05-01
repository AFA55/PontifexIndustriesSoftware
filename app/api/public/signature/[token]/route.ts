export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/public/signature/[token]
 * PUBLIC — No auth required
 * GET: Validate token, return job info + form fields
 * POST: Save signature data, survey data
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { sendSMS, formatPhoneNumber } from '@/lib/sms';
import { sendEmail } from '@/lib/email';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Find the signature request by token
    const { data: sigRequest, error } = await supabaseAdmin
      .from('signature_requests')
      .select('*, form_templates(*)')
      .eq('token', token)
      .single();

    if (error || !sigRequest) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    // Check if already signed
    if (sigRequest.status === 'signed') {
      return NextResponse.json({ error: 'already_signed', message: 'This document has already been signed' }, { status: 410 });
    }

    // Check if expired
    if (sigRequest.expires_at && new Date(sigRequest.expires_at) < new Date()) {
      return NextResponse.json({ error: 'expired', message: 'This signature request has expired' }, { status: 410 });
    }

    // Get job info
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, job_type, address, location, description, assigned_to, site_contact_phone, customer_contact, in_route_at, arrived_at_jobsite_at, work_started_at, work_completed_at')
      .eq('id', sigRequest.job_order_id)
      .single();

    // Fetch work items for this job
    const { data: workItems } = await supabaseAdmin
      .from('work_items')
      .select('work_type, quantity, notes, core_quantity, core_size, linear_feet_cut')
      .eq('job_order_id', sigRequest.job_order_id)
      .order('created_at', { ascending: true });

    // Fetch recent daily logs for this job
    const { data: dailyLogs } = await supabaseAdmin
      .from('daily_job_logs')
      .select('log_date, hours_worked, work_performed')
      .eq('job_order_id', sigRequest.job_order_id)
      .order('log_date', { ascending: false })
      .limit(10);

    // Update status to 'opened' if currently pending/sent
    if (['pending', 'sent'].includes(sigRequest.status)) {
      Promise.resolve(
        supabaseAdmin
          .from('signature_requests')
          .update({ status: 'opened', opened_at: new Date().toISOString() })
          .eq('id', sigRequest.id)
      ).catch(() => {});
    }

    return NextResponse.json({
      success: true,
      data: {
        request_type: sigRequest.request_type,
        contact_name: sigRequest.contact_name,
        status: sigRequest.status,
        form_template: sigRequest.form_templates || null,
        work_items: workItems || [],
        daily_logs: dailyLogs || [],
        job: job ? {
          job_number: job.job_number,
          customer_name: job.customer_name,
          job_type: job.job_type,
          address: job.address || job.location,
          description: job.description,
          customer_contact: job.customer_contact,
          site_contact_phone: job.site_contact_phone || null,
          in_route_at: job.in_route_at,
          arrived_at_jobsite_at: job.arrived_at_jobsite_at,
          work_started_at: job.work_started_at,
          work_completed_at: job.work_completed_at,
        } : null,
      },
    });
  } catch (error: any) {
    console.error('Error in public signature GET:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    // Find the signature request
    const { data: sigRequest, error: findError } = await supabaseAdmin
      .from('signature_requests')
      .select('*')
      .eq('token', token)
      .single();

    if (findError || !sigRequest) {
      return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 });
    }

    if (sigRequest.status === 'signed') {
      return NextResponse.json({ error: 'already_signed', message: 'Already signed' }, { status: 410 });
    }

    if (sigRequest.expires_at && new Date(sigRequest.expires_at) < new Date()) {
      return NextResponse.json({ error: 'expired', message: 'This request has expired' }, { status: 410 });
    }

    const body = await request.json();
    const { signature_data, signer_name, signer_title, form_data, survey } = body;

    if (!signature_data) {
      return NextResponse.json({ error: 'Signature is required' }, { status: 400 });
    }

    // Update signature request
    const { error: updateError } = await supabaseAdmin
      .from('signature_requests')
      .update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        signature_data,
        signer_name: signer_name || null,
        signer_title: signer_title || null,
        form_data: form_data || {},
      })
      .eq('id', sigRequest.id);

    if (updateError) {
      console.error('Error updating signature request:', updateError);
      return NextResponse.json({ error: 'Failed to save signature' }, { status: 500 });
    }

    // If completion type, update job_orders with remote signature
    if (sigRequest.request_type === 'completion') {
      const signer_ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || null;
      Promise.resolve(
        supabaseAdmin
          .from('job_orders')
          .update({
            customer_signature: signature_data,
            customer_signed_at: new Date().toISOString(),
            customer_signature_method: 'remote',
            ...(signer_name ? { completion_signer_name: signer_name } : {}),
          })
          .eq('id', sigRequest.job_order_id)
      ).then(() => {}).catch(() => {});

      // Also store signer_ip on the signature_request (fire-and-forget)
      if (signer_ip) {
        Promise.resolve(
          supabaseAdmin
            .from('signature_requests')
            .update({ signer_ip } as any)
            .eq('id', sigRequest.id)
        ).then(() => {}).catch(() => {});
      }

      // Notify admins
      Promise.resolve(
        supabaseAdmin
          .from('schedule_notifications')
          .insert({
            job_order_id: sigRequest.job_order_id,
            notification_type: 'job_completed',
            title: 'Customer Signed Work Ticket',
            message: `${signer_name || 'Customer'} signed the work completion form remotely.`,
            is_read: false,
            created_at: new Date().toISOString(),
          })
      ).then(() => {}).catch(() => {});
    }

    // If completion type and survey data included, save survey
    if (sigRequest.request_type === 'completion' && survey) {
      // Get operator ID + delivery channel info from job
      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select('assigned_to, job_number, customer_name, site_contact_phone, customer_contact, tenant_id')
        .eq('id', sigRequest.job_order_id)
        .single();

      const cleanliness = clampInt(survey.cleanliness_rating, 1, 5);
      const communication = clampInt(survey.communication_rating, 1, 5);
      const likelyAgain = clampInt(survey.likely_to_use_again_rating, 1, 10);
      const sendToEmail = (survey.customer_email || '').trim() || null;
      const operatorNotes = (survey.operator_feedback_notes || '').trim() || null;

      // Backwards-compat: prefer explicit overall, else avg cleanliness+communication.
      let overall: number | null = clampInt(survey.overall_rating, 1, 5);
      if (overall === null) {
        if (cleanliness && communication) {
          overall = Math.round((cleanliness + communication) / 2);
        } else if (cleanliness || communication) {
          overall = cleanliness || communication;
        }
      }

      // Decide delivery channel: email if customer provided one, else site_contact_phone.
      const sitePhone = (job?.site_contact_phone || job?.customer_contact || '').trim() || null;
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

      const surveyData: Record<string, any> = {
        job_order_id: sigRequest.job_order_id,
        signature_request_id: sigRequest.id,
        operator_id: job?.assigned_to || null,
        cleanliness_rating: cleanliness,
        communication_rating: communication,
        overall_rating: overall,
        would_recommend: survey.would_recommend ?? null,
        feedback_text: survey.feedback_text || null,
        operator_feedback_notes: operatorNotes,
        likely_to_use_again_rating: likelyAgain,
        customer_email: sendToEmail,
        delivered_to: deliveredTo,
        tenant_id: job?.tenant_id || null,
      };

      const { error: surveyError } = await supabaseAdmin
        .from('customer_surveys')
        .insert(surveyData);

      if (surveyError) {
        console.error('Error saving survey (non-blocking):', surveyError);
      }

      // Update operator ratings (fire-and-forget)
      if (job?.assigned_to && (cleanliness || communication || overall)) {
        Promise.resolve(
          updateOperatorRatings(job.assigned_to, {
            cleanliness_rating: cleanliness || undefined,
            communication_rating: communication || undefined,
            overall_rating: overall || undefined,
          })
        ).catch(() => {});
      }

      // Dispatch delivery (fire-and-forget) — never blocks the save.
      if (deliveryChannel === 'sms' && deliveredTo) {
        const phone = deliveredTo.replace(/^sms:/, '');
        const msg = buildSurveySmsMessage({
          jobNumber: job?.job_number || '',
          cleanliness,
          communication,
          likelyAgain,
        });
        Promise.resolve(sendSMS({ to: phone, message: msg, jobId: sigRequest.job_order_id }))
          .then(() => {})
          .catch(() => {});
      } else if (deliveryChannel === 'email' && sendToEmail) {
        const html = buildSurveyEmailHtml({
          jobNumber: job?.job_number || '',
          customerName: job?.customer_name || '',
          cleanliness,
          communication,
          likelyAgain,
          notes: operatorNotes,
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
    }

    // If there's a form assignment linked, mark it completed
    if (sigRequest.form_template_id) {
      Promise.resolve(
        supabaseAdmin
          .from('job_form_assignments')
          .update({
            status: 'completed',
            completed_data: form_data || {},
            completed_at: new Date().toISOString(),
            signature_request_id: sigRequest.id,
          })
          .eq('job_order_id', sigRequest.job_order_id)
          .eq('form_template_id', sigRequest.form_template_id)
      ).catch(() => {});
    }

    return NextResponse.json({ success: true, message: 'Signature recorded successfully' });
  } catch (error: any) {
    console.error('Error in public signature POST:', error);
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 });
  }
}

async function updateOperatorRatings(
  operatorId: string,
  survey: { cleanliness_rating?: number; communication_rating?: number; overall_rating?: number }
) {
  try {
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('cleanliness_rating_avg, cleanliness_rating_count, communication_rating_avg, communication_rating_count, overall_rating_avg, overall_rating_count, total_ratings_received')
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
      updates.cleanliness_rating_avg = parseFloat((((oldAvg * oldCount) + survey.cleanliness_rating) / newCount).toFixed(2));
      updates.cleanliness_rating_count = newCount;
    }

    if (survey.communication_rating) {
      const oldAvg = profile.communication_rating_avg || 0;
      const oldCount = profile.communication_rating_count || 0;
      const newCount = oldCount + 1;
      updates.communication_rating_avg = parseFloat((((oldAvg * oldCount) + survey.communication_rating) / newCount).toFixed(2));
      updates.communication_rating_count = newCount;
    }

    if (survey.overall_rating) {
      const oldAvg = profile.overall_rating_avg || 0;
      const oldCount = profile.overall_rating_count || 0;
      const newCount = oldCount + 1;
      updates.overall_rating_avg = parseFloat((((oldAvg * oldCount) + survey.overall_rating) / newCount).toFixed(2));
      updates.overall_rating_count = newCount;
    }

    await supabaseAdmin.from('profiles').update(updates).eq('id', operatorId);
  } catch (err) {
    console.error('Error updating operator ratings from survey:', err);
  }
}

/* ─── helpers (survey v2) ──────────────────────────────── */

function clampInt(
  v: number | undefined | null,
  min: number,
  max: number
): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  const n = Math.round(v);
  if (n < min || n > max) return null;
  return n;
}

function buildSurveySmsMessage({
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
  const parts: string[] = [
    `Thanks for your feedback on JOB ${jobNumber || ''}!`.trim(),
  ];
  const ratingBits: string[] = [];
  if (cleanliness) ratingBits.push(`cleanliness ${cleanliness}/5`);
  if (communication) ratingBits.push(`communication ${communication}/5`);
  if (likelyAgain) ratingBits.push(`likelihood to recommend ${likelyAgain}/10`);
  if (ratingBits.length) parts.push(`You rated ${ratingBits.join(', ')}.`);
  parts.push('We appreciate your business.');
  return parts.join(' ');
}

function buildSurveyEmailHtml({
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
  const escape = (s: string) =>
    String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

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
                Patriot Concrete Cutting &middot; Job ${escape(jobNumber)}
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <p style="margin:0 0 20px;color:#475569;font-size:16px;line-height:1.6;">
                ${customerName ? `Hi <strong style="color:#0f172a;">${escape(customerName)}</strong>,` : 'Hi,'}
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
                      <p style="margin:0;color:#312e81;font-size:14px;line-height:1.6;white-space:pre-wrap;">${escape(notes)}</p>
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
