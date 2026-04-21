export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/job-orders/[id]/duplicate
 * Duplicate a job order to a new date while maintaining project connection.
 *
 * Body: { scheduled_date: string, end_date?: string, notes?: string }
 * - Copies all fields from original except transient/status fields
 * - Generates a new job number
 * - Links back to original via parent_job_id
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { getTenantId } from '@/lib/get-tenant-id';

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
]);

function generateJobNumber(): string {
  const year = new Date().getFullYear();
  const seq = Math.floor(100000 + Math.random() * 900000);
  return `JOB-${year}-${seq}`;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const tenantId = await getTenantId(auth.userId);

    if (!tenantId) return NextResponse.json({ error: 'Tenant scope required. super_admin must pass ?tenantId=' }, { status: 400 });
    const body = await request.json();
    const { scheduled_date, end_date, notes } = body;

    if (!scheduled_date) {
      return NextResponse.json(
        { error: 'scheduled_date is required' },
        { status: 400 }
      );
    }

    // Fetch the original job order
    let origQuery = supabaseAdmin
      .from('job_orders')
      .select('*')
      .eq('id', id);
    origQuery = origQuery.eq('tenant_id', tenantId);
    const { data: original, error: fetchError } = await origQuery.single();

    if (fetchError || !original) {
      return NextResponse.json(
        { error: 'Job order not found' },
        { status: 404 }
      );
    }

    // Build the new job order by copying non-excluded fields
    const newJobOrder: Record<string, any> = {};
    for (const [key, value] of Object.entries(original)) {
      if (!EXCLUDED_FIELDS.has(key)) {
        newJobOrder[key] = value;
      }
    }

    // Set new values
    newJobOrder.job_number = generateJobNumber();
    newJobOrder.scheduled_date = scheduled_date;
    newJobOrder.end_date = end_date || null;
    newJobOrder.status = 'scheduled';
    newJobOrder.parent_job_id = id;

    // Append notes if provided
    if (notes) {
      const existing = newJobOrder.notes || '';
      newJobOrder.notes = existing
        ? `${existing}\n---\nDuplicated: ${notes}`
        : `Duplicated: ${notes}`;
    }

    const { data: created, error: insertError } = await supabaseAdmin
      .from('job_orders')
      .insert(newJobOrder)
      .select()
      .single();

    if (insertError) {
      console.error('Error duplicating job order:', insertError);
      return NextResponse.json(
        { error: 'Failed to duplicate job order' },
        { status: 500 }
      );
    }

    // Audit log (fire-and-forget)
    Promise.resolve(
      supabaseAdmin.from('job_orders_history').insert({
        job_order_id: created.id,
        job_number: created.job_number,
        changed_by: auth.userId,
        changed_by_name: auth.userEmail,
        changed_by_role: auth.role,
        change_type: 'duplicated',
        changes: {
          duplicated_from: {
            id: original.id,
            job_number: original.job_number,
          },
        },
        snapshot: created,
      })
    ).catch(() => {});

    return NextResponse.json({ success: true, data: created }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in duplicate route:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
