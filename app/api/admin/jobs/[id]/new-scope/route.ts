export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/jobs/[id]/new-scope
 * Create a continuation job for the same client/project with a new ticket/quote.
 *
 * Body: {
 *   scheduled_date: string,
 *   end_date?: string,
 *   scope_description?: string,
 *   estimated_cost?: number,
 *   notes?: string
 * }
 *
 * - Copies all non-transient fields from the original job
 * - Sets parent_job_id = original job id
 * - Generates a new QA-{year}-{6 digits} job number
 * - Sets status = 'scheduled'
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

// Fields that should NOT be copied to the continuation job
const EXCLUDED_FIELDS = new Set([
  'id',
  'job_number',
  'created_at',
  'updated_at',
  'status',
  'dispatched_at',
  'completed_at',
  'customer_signature',
  'customer_signed_at',
  'loading_started_at',
  'en_route_at',
  'in_progress_at',
  'done_for_day_at',
  'daily_job_logs',
  'completion_submitted_at',
  'completion_approved_at',
  'completion_rejected_at',
]);

function generateJobNumber(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(100000 + Math.random() * 900000);
  return `QA-${year}-${seq}`;
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();

    const { scheduled_date, end_date, scope_description, estimated_cost, notes } = body;

    if (!scheduled_date || typeof scheduled_date !== 'string') {
      return NextResponse.json({ error: 'scheduled_date is required' }, { status: 400 });
    }

    // Fetch the original job
    let origQuery = supabaseAdmin.from('job_orders').select('*').eq('id', jobId);
    if (tenantId) {
      origQuery = origQuery.eq('tenant_id', tenantId);
    }
    const { data: original, error: fetchError } = await origQuery.single();

    if (fetchError || !original) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    // Build new job by copying non-excluded fields
    const newJob: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(original)) {
      if (!EXCLUDED_FIELDS.has(key)) {
        newJob[key] = value;
      }
    }

    // Apply overrides
    newJob.job_number = generateJobNumber();
    newJob.status = 'scheduled';
    newJob.parent_job_id = jobId;
    newJob.scheduled_date = scheduled_date;
    newJob.end_date = end_date ?? null;

    if (scope_description && typeof scope_description === 'string' && scope_description.trim()) {
      newJob.description = scope_description.trim();
    }

    if (estimated_cost != null && !isNaN(Number(estimated_cost))) {
      newJob.estimated_cost = Number(estimated_cost);
    }

    // Append continuation note
    const continuationNote = `Continuation of ${original.job_number}`;
    if (notes && typeof notes === 'string' && notes.trim()) {
      const existingNotes = (newJob.notes as string) ?? '';
      newJob.notes = existingNotes
        ? `${existingNotes}\n---\n${notes.trim()}\n${continuationNote}`
        : `${notes.trim()}\n${continuationNote}`;
    } else {
      const existingNotes = (newJob.notes as string) ?? '';
      newJob.notes = existingNotes
        ? `${existingNotes}\n---\n${continuationNote}`
        : continuationNote;
    }

    const { data: created, error: insertError } = await supabaseAdmin
      .from('job_orders')
      .insert(newJob)
      .select()
      .single();

    if (insertError) {
      console.error('Error creating continuation job:', insertError);
      return NextResponse.json({ error: 'Failed to create continuation job' }, { status: 500 });
    }

    // Fire-and-forget audit log on both jobs
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert([
        {
          job_order_id: created.id,
          job_number: created.job_number,
          changed_by: auth.userId,
          changed_by_name: auth.userEmail,
          changed_by_role: auth.role,
          change_type: 'new_scope_job_created',
          changes: {
            parent_job_id: jobId,
            parent_job_number: original.job_number,
          },
          snapshot: created,
        },
        {
          job_order_id: jobId,
          job_number: original.job_number,
          changed_by: auth.userId,
          changed_by_name: auth.userEmail,
          changed_by_role: auth.role,
          change_type: 'new_scope_job_created',
          changes: {
            continuation_job_id: created.id,
            continuation_job_number: created.job_number,
          },
        },
      ])
    ).catch(() => {});

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error: unknown) {
    console.error('Unexpected error in POST /new-scope:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
