export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/public/signature/[token]
 * PUBLIC — No auth required
 * GET: Validate token, return job info + form fields
 * POST: Save signature data, survey data
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';

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
      .select('id, job_number, customer_name, job_type, address, location, description, assigned_to, site_contact_phone, customer_contact')
      .eq('id', sigRequest.job_order_id)
      .single();

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
        job: job ? {
          job_number: job.job_number,
          customer_name: job.customer_name,
          job_type: job.job_type,
          address: job.address || job.location,
          description: job.description,
          customer_contact: job.customer_contact,
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
      // Get operator ID from job
      const { data: job } = await supabaseAdmin
        .from('job_orders')
        .select('assigned_to')
        .eq('id', sigRequest.job_order_id)
        .single();

      const surveyData = {
        job_order_id: sigRequest.job_order_id,
        signature_request_id: sigRequest.id,
        operator_id: job?.assigned_to || null,
        cleanliness_rating: survey.cleanliness_rating || null,
        communication_rating: survey.communication_rating || null,
        overall_rating: survey.overall_rating || null,
        would_recommend: survey.would_recommend ?? null,
        feedback_text: survey.feedback_text || null,
      };

      const { error: surveyError } = await supabaseAdmin
        .from('customer_surveys')
        .insert(surveyData);

      if (surveyError) {
        console.error('Error saving survey (non-blocking):', surveyError);
      }

      // Update operator ratings (fire-and-forget)
      if (job?.assigned_to && (survey.cleanliness_rating || survey.communication_rating || survey.overall_rating)) {
        Promise.resolve(
          updateOperatorRatings(job.assigned_to, survey)
        ).catch(() => {});
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
