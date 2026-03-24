/**
 * API Route: GET/POST /api/job-orders/[id]/survey
 * Smart Job Survey — save/retrieve survey data for a job order.
 *
 * POST: Save survey JSONB → job_orders.job_survey
 * GET:  Return existing survey data
 * Auth: Bearer token, user must be assigned_to or helper_assigned_to
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // SECURITY: Require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Fetch job with survey data
    const { data: job, error } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, job_survey, assigned_to, helper_assigned_to')
      .eq('id', jobId)
      .single();

    if (error || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify user is assigned to this job or is an admin role
    if (job.assigned_to !== auth.userId && job.helper_assigned_to !== auth.userId) {
      if (!['admin', 'super_admin', 'operations_manager'].includes(auth.role)) {
        return NextResponse.json({ error: 'Not authorized for this job' }, { status: 403 });
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        job_id: job.id,
        job_number: job.job_number,
        job_survey: job.job_survey || null,
      },
    });
  } catch (error: any) {
    console.error('Error in GET /api/job-orders/[id]/survey:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: jobId } = await params;

    // SECURITY: Require authenticated user
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    // Fetch job to verify access
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Verify user is assigned to this job or is an admin role
    if (job.assigned_to !== auth.userId && job.helper_assigned_to !== auth.userId) {
      if (!['admin', 'super_admin', 'operations_manager'].includes(auth.role)) {
        return NextResponse.json({ error: 'Not authorized for this job' }, { status: 403 });
      }
    }

    // Parse survey data from request body
    const surveyData = await request.json();

    // Add metadata
    const surveyPayload = {
      ...surveyData,
      submitted_at: new Date().toISOString(),
      submitted_by: auth.userId,
    };

    // Save to job_orders.job_survey
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('job_orders')
      .update({ job_survey: surveyPayload })
      .eq('id', jobId)
      .select('id, job_number, job_survey')
      .single();

    if (updateError) {
      console.error('Error saving survey:', updateError);
      return NextResponse.json({ error: 'Failed to save survey' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: 'Survey saved successfully',
      data: updated,
    });
  } catch (error: any) {
    console.error('Error in POST /api/job-orders/[id]/survey:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
