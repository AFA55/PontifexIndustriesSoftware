export const dynamic = 'force-dynamic';

/**
 * GET /api/admin/pending-jobs — office/admin (requireSalesStaff)
 * Lists jobs parked on-hold (the "Pending Jobs" bucket), newest first, with
 * the latest "job not ready" report (reason + photos + signer) attached so the
 * PM can review and reschedule / push the ticket back up.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    let query = supabaseAdmin
      .from('job_orders')
      .select('id, job_number, customer_name, customer_contact, site_contact_phone, address, location, job_type, scheduled_date, end_date, arrival_time, on_hold_reason, on_hold_placed_at, on_hold_placed_by, project_manager_id, assigned_to')
      .eq('status', 'on_hold')
      .order('on_hold_placed_at', { ascending: false, nullsFirst: false });
    if (auth.tenantId) query = query.eq('tenant_id', auth.tenantId);
    const { data: jobs, error } = await query;
    if (error) {
      console.error('Error listing pending jobs:', error);
      return NextResponse.json({ error: 'Failed to load pending jobs' }, { status: 500 });
    }

    const list = jobs || [];
    if (list.length === 0) return NextResponse.json({ success: true, data: [] });

    // Attach the latest not-ready report per job (reason/photos/signer).
    const jobIds = list.map((j) => j.id);
    const { data: reports } = await supabaseAdmin
      .from('job_not_ready_reports')
      .select('job_order_id, reason, photo_urls, signer_name, signed_at, created_at, reported_by')
      .in('job_order_id', jobIds)
      .order('created_at', { ascending: false });

    const reportByJob: Record<string, any> = {};
    for (const r of reports || []) {
      if (!reportByJob[r.job_order_id]) reportByJob[r.job_order_id] = r; // first = latest
    }

    // Resolve reporter + PM names.
    const nameIds = [
      ...new Set([
        ...list.map((j) => j.project_manager_id).filter(Boolean),
        ...(reports || []).map((r) => r.reported_by).filter(Boolean),
      ]),
    ];
    let nameById: Record<string, string> = {};
    if (nameIds.length) {
      const { data: profs } = await supabaseAdmin.from('profiles').select('id, full_name').in('id', nameIds);
      nameById = Object.fromEntries((profs || []).map((p) => [p.id, p.full_name]));
    }

    const data = list.map((j) => {
      const report = reportByJob[j.id] || null;
      return {
        ...j,
        project_manager_name: j.project_manager_id ? nameById[j.project_manager_id] ?? null : null,
        not_ready: report
          ? {
              reason: report.reason,
              photo_urls: Array.isArray(report.photo_urls) ? report.photo_urls : [],
              signer_name: report.signer_name,
              signed_at: report.signed_at,
              reported_at: report.created_at,
              reported_by_name: report.reported_by ? nameById[report.reported_by] ?? null : null,
            }
          : null,
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Unexpected error in GET /pending-jobs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
