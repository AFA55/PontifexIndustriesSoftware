export const dynamic = 'force-dynamic';

/**
 * API Route: /api/job-orders/[id]/work-performed-draft
 * Auto-save and restore draft work-performed state for operators.
 *
 * GET — load most recent draft for the calling operator on this job
 * PUT — save (upsert) draft; creates a log row if none exists for today
 *
 * Draft state is stored in daily_job_logs.work_performed_draft (jsonb).
 * On final submission via /daily-log, the real work_performed column is
 * written and the draft columns are cleared.
 *
 * Schema note: daily_job_logs has UNIQUE(job_order_id, operator_id, log_date),
 * allowing the primary operator and helper to each have their own row.
 * The trigger set_daily_log_day_number auto-assigns day_number on INSERT.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

type RouteContext = { params: Promise<{ id: string }> };

// ---------------------------------------------------------------------------
// GET — retrieve the latest draft for the calling operator
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const { userId } = auth;

    // Verify the job exists and belongs to the operator's tenant
    const tenantId = await getTenantId(userId);
    const jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to')
      .eq('id', jobId);
    if (tenantId) {
      jobQuery.eq('tenant_id', tenantId);
    }
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Only the assigned operator (or helper) may read their own draft
    const isAssigned =
      job.assigned_to === userId || job.helper_assigned_to === userId;
    if (!isAssigned) {
      return NextResponse.json(
        { error: 'You are not assigned to this job' },
        { status: 403 }
      );
    }

    // Get the most recent daily log for this operator on this job.
    // Order by created_at DESC so we always get the most recent row regardless
    // of day_number (draft-skeleton rows may share day_number=1 with real rows).
    const { data: log, error: logError } = await supabaseAdmin
      .from('daily_job_logs')
      .select('id, day_number, work_performed_draft, work_performed_draft_updated_at')
      .eq('job_order_id', jobId)
      .eq('operator_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (logError) {
      console.error('Error fetching work-performed draft:', logError);
      return NextResponse.json(
        { error: 'Failed to fetch draft' },
        { status: 500 }
      );
    }

    // Return gracefully with null draft when no log row exists yet
    return NextResponse.json({
      success: true,
      data: {
        draft: log?.work_performed_draft ?? null,
        updated_at: log?.work_performed_draft_updated_at ?? null,
        log_id: log?.id ?? null,
        day_number: log?.day_number ?? null,
      },
    });
  } catch (err: unknown) {
    console.error('Unexpected error in GET work-performed-draft:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PUT — save (upsert) draft for today
// ---------------------------------------------------------------------------
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const { userId } = auth;

    const body = await request.json();
    const { draft } = body as { draft: unknown };

    if (draft === undefined) {
      return NextResponse.json(
        { error: 'Missing required field: draft' },
        { status: 400 }
      );
    }

    // Verify the job exists and belongs to the operator's tenant
    const tenantId = await getTenantId(userId);
    const jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to')
      .eq('id', jobId);
    if (tenantId) {
      jobQuery.eq('tenant_id', tenantId);
    }
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const isAssigned =
      job.assigned_to === userId || job.helper_assigned_to === userId;
    if (!isAssigned) {
      return NextResponse.json(
        { error: 'You are not assigned to this job' },
        { status: 403 }
      );
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const now = new Date().toISOString();

    // Look for an existing log row for this operator on this job today.
    // The unique constraint is now (job_order_id, operator_id, log_date) so
    // each operator gets their own row — no collision with helpers.
    const { data: existingLog, error: lookupError } = await supabaseAdmin
      .from('daily_job_logs')
      .select('id')
      .eq('job_order_id', jobId)
      .eq('operator_id', userId)
      .eq('log_date', today)
      .maybeSingle();

    if (lookupError) {
      console.error('Error looking up existing log:', lookupError);
      return NextResponse.json(
        { error: 'Failed to save draft' },
        { status: 500 }
      );
    }

    let savedLogId: string | null = null;

    if (existingLog) {
      // Update draft on the existing row.
      // Note: daily_job_logs has no `updated_at` column (only created_at);
      // the timestamp lives on `work_performed_draft_updated_at`.
      const { data: updated, error: updateError } = await supabaseAdmin
        .from('daily_job_logs')
        .update({
          work_performed_draft: draft,
          work_performed_draft_updated_at: now,
        })
        .eq('id', existingLog.id)
        .select('id')
        .single();

      if (updateError) {
        console.error('Error updating work-performed draft:', updateError);
        return NextResponse.json(
          { error: 'Failed to save draft' },
          { status: 500 }
        );
      }
      savedLogId = updated.id;
    } else {
      // No log row exists yet for today — insert a skeleton row to hold the draft.
      // - day_completed_at is nullable; omit it so the trigger/submission sets it.
      // - day_number is auto-set by the set_daily_log_day_number INSERT trigger.
      // - tenant_id is carried forward from the operator's profile for isolation.
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from('daily_job_logs')
        .insert({
          job_order_id: jobId,
          operator_id: userId,
          tenant_id: tenantId ?? null,
          log_date: today,
          work_performed_draft: draft,
          work_performed_draft_updated_at: now,
          // work_performed, hours_worked default to [] and 0 via column defaults
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Error inserting draft log row:', insertError);
        return NextResponse.json(
          { error: 'Failed to save draft' },
          { status: 500 }
        );
      }
      savedLogId = inserted.id;
    }

    return NextResponse.json({
      success: true,
      data: {
        log_id: savedLogId,
        updated_at: now,
      },
    });
  } catch (err: unknown) {
    console.error('Unexpected error in PUT work-performed-draft:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
