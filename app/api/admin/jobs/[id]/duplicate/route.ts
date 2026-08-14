export const dynamic = 'force-dynamic';

/**
 * API Route: POST /api/admin/jobs/[id]/duplicate
 * Creates a copy of an existing job with a new operator + optional date.
 * The duplicate gets a fresh job_number + status=scheduled, and links back
 * to the root parent via parent_job_id (so all siblings share one root).
 * Access: admin, operations_manager, super_admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';
import { insertJobOrderCopy, describeInsertError } from '@/lib/duplicate-job-order';

// NOTE (Aug 2026): unlike /api/admin/job-orders/[id]/duplicate, this route was
// NOT broken by the GENERATED columns (`total_cost`, `gross_profit`) — it names
// an explicit allowlist of columns instead of spreading the source row, and
// neither generated column is on it. It still goes through insertJobOrderCopy
// so that if someone ever adds a generated column to the list below, the insert
// self-heals and the error message names the column instead of "Failed".

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { id: jobId } = await context.params;
  const tenantId = auth.tenantId!;

  let body: { assigned_to?: string; scheduled_date?: string } = {};
  try {
    body = await request.json();
  } catch {
    // empty body is fine — we validate below
  }

  const { assigned_to, scheduled_date } = body;
  if (!assigned_to) {
    return NextResponse.json({ error: 'assigned_to is required' }, { status: 400 });
  }

  // ── 1. Fetch original job ────────────────────────────────────────────────
  const { data: original, error: fetchErr } = await supabaseAdmin
    .from('job_orders')
    .select('*')
    .eq('id', jobId)
    .eq('tenant_id', tenantId)
    // A copy of a soft-deleted job would be invisible everywhere.
    .is('deleted_at', null)
    .maybeSingle();

  if (fetchErr || !original) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  // ── 2. Generate new job number: JOB-{year}-{6-digit padded} ─────────────
  const year = new Date().getFullYear();
  const { count } = await supabaseAdmin
    .from('job_orders')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  const seq = String((count ?? 0) + 1).padStart(6, '0');
  const jobNumber = `JOB-${year}-${seq}`;

  // ── 3. Resolve parent: if original is itself a copy, link to its root ────
  const parentId: string = original.parent_job_id ?? original.id;

  // The one day this copy is for. Falls back to the original's START date —
  // never its end date, and never a span (see the insert below).
  const duplicateDate: string | null = scheduled_date || original.scheduled_date || null;

  // ── 4. Insert duplicate ──────────────────────────────────────────────────
  const { data: newJob, error: insertErr } = await insertJobOrderCopy(
    supabaseAdmin as any,
    {
      tenant_id: tenantId,
      job_number: jobNumber,
      title: original.title,
      customer_name: original.customer_name,
      customer_id: original.customer_id,
      address: original.address,
      location: original.location,
      description: original.description,
      job_type: original.job_type,
      status: 'scheduled',
      priority: original.priority,
      // A DUPLICATE IS ONE DAY (founder, Aug 14).
      //
      // These two lines used to copy the original's span, and the original
      // Parkk job at 520 Logistics Dr runs Aug 3 → Sep 3. So each duplicate
      // inherited a month, and a multi-day job with no crew shows in Unassigned
      // on EVERY day it spans: three copies made for three specific days became
      // three Parkk rows sitting in Unassigned every day until September.
      //
      // "If I double a job I must do it manually for that day, not have it
      // consistently there." A copy lands on the chosen day and stops. Making
      // it span again is an explicit edit — one the office does deliberately,
      // on the one job that needs it.
      scheduled_date: duplicateDate,
      end_date: duplicateDate,
      estimated_hours: original.estimated_hours,
      assigned_to,
      helper_assigned_to: null,
      equipment_needed: original.equipment_needed,
      equipment_selections: original.equipment_selections,
      mandatory_equipment: original.mandatory_equipment,
      special_equipment: original.special_equipment,
      special_equipment_notes: original.special_equipment_notes,
      scope_details: original.scope_details,
      scope_photo_urls: original.scope_photo_urls,
      jobsite_conditions: original.jobsite_conditions,
      site_compliance: original.site_compliance,
      additional_info: original.additional_info,
      directions: original.directions,
      foreman_name: original.foreman_name,
      foreman_phone: original.foreman_phone,
      site_contact_phone: original.site_contact_phone,
      po_number: original.po_number,
      // Single day by construction — see scheduled_date above. Copying the
      // original's flag is what put the duplicate on every date in its span.
      is_multi_day: false,
      require_waiver_signature: original.require_waiver_signature,
      parent_job_id: parentId,
      created_by: auth.userId,
      // `salesman_id` does not exist on job_orders — the sale is attributed by
      // name/email. (The old key was silently dropped as undefined.)
      salesman_name: original.salesman_name,
      salesperson_email: original.salesperson_email,
    },
    'id, job_number'
  );

  if (insertErr || !newJob) {
    console.error('[duplicate] insert error:', insertErr);
    return NextResponse.json(
      { error: describeInsertError(insertErr, 'Failed to create duplicate') },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true, data: newJob }, { status: 201 });
}
