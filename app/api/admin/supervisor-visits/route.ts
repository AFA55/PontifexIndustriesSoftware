export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/supervisor-visits  -> list visits (scope: own for supervisor, all-in-tenant for admin/ops/super)
 * POST /api/admin/supervisor-visits  -> create a visit (supervisors + admins)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth, resolveTenantScope } from '@/lib/api-auth';
import { signStoredUrlsBatch } from '@/lib/storage-url-server';

// Read = anyone in management can VIEW visit reports (incl. plain admin + salesman).
const READ_ROLES = new Set(['supervisor', 'admin', 'super_admin', 'operations_manager', 'salesman']);
// Create = filing a visit report is for supervisors / ops managers / super_admin only.
// Plain admins are VIEW-ONLY by design (founder intent), enforced server-side here, not just in the UI.
const CREATE_ROLES = new Set(['supervisor', 'super_admin', 'operations_manager']);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!READ_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const operatorId = searchParams.get('operator_id');
  const jobOrderId = searchParams.get('job_order_id');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  // Tenant scoping — UNCONDITIONAL. The previous shape
  // (`if (role !== 'super_admin' && tenantId) .eq(...)`) is the documented
  // unsafe pattern (lib/api-auth.ts:13-17): it dropped the filter entirely for
  // super_admin, and a tenant-scoped super_admin (a client's own) could read
  // another client's visit reports. resolveTenantScope confines non-platform
  // super_admins to their own tenant and guarantees a non-null id.
  const scope = await resolveTenantScope(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  let query = supabaseAdmin
    .from('supervisor_visits')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // Supervisors only see their own
  if (auth.role === 'supervisor') {
    query = query.eq('supervisor_id', auth.userId);
  }

  if (operatorId) query = query.eq('operator_id', operatorId);
  // Per-job visibility: the job detail page asks "which walkthroughs happened on
  // THIS job?" (idx_supervisor_visits_job already covers this).
  if (jobOrderId) query = query.eq('job_order_id', jobOrderId);
  if (startDate) query = query.gte('visit_date', startDate);
  if (endDate) query = query.lte('visit_date', endDate);

  const { data, error } = await query;
  if (error) {
    console.error('supervisor-visits GET error:', error);
    return NextResponse.json({ error: 'Failed to load visits' }, { status: 500 });
  }

  const visits = data ?? [];
  if (visits.length === 0) return NextResponse.json({ success: true, data: [] });

  // maintenance-photos is private and the stored URLs are 30-day signed links —
  // re-sign on read or anything older than a month 404s in the browser.
  // Batched: one storage round-trip for every photo in the response.
  const photoValues: string[] = [];
  for (const v of visits) {
    if (Array.isArray(v.photo_urls)) photoValues.push(...v.photo_urls.filter((u: unknown) => typeof u === 'string'));
    if (Array.isArray(v.equipment_issues)) {
      for (const issue of v.equipment_issues) {
        if (issue && Array.isArray(issue.photo_urls)) {
          photoValues.push(...issue.photo_urls.filter((u: unknown) => typeof u === 'string'));
        }
      }
    }
  }
  const signedMap = new Map<string, string>();
  if (photoValues.length > 0) {
    const signed = await signStoredUrlsBatch(photoValues);
    photoValues.forEach((orig, i) => signedMap.set(orig, signed[i] ?? orig));
  }
  const sign = (list: unknown): string[] =>
    Array.isArray(list)
      ? list.filter((u): u is string => typeof u === 'string').map((u) => signedMap.get(u) ?? u)
      : [];

  // Equipment issues flagged on a visit become maintenance_requests. Surface the
  // shop's status back on the visit so "flagged" vs "fixed" is visible in place.
  const { data: mrRows } = await supabaseAdmin
    .from('maintenance_requests')
    .select('id, supervisor_visit_id, equipment_name, status, request_type, priority, resolved_at')
    .eq('tenant_id', tenantId)
    .in('supervisor_visit_id', visits.map((v) => v.id));

  const mrByVisit = new Map<string, unknown[]>();
  for (const mr of mrRows ?? []) {
    if (!mr.supervisor_visit_id) continue;
    const list = mrByVisit.get(mr.supervisor_visit_id) ?? [];
    list.push(mr);
    mrByVisit.set(mr.supervisor_visit_id, list);
  }

  const enriched = visits.map((v) => ({
    ...v,
    photo_urls: sign(v.photo_urls),
    equipment_issues: Array.isArray(v.equipment_issues)
      ? v.equipment_issues.map((issue: Record<string, unknown>) =>
          issue && typeof issue === 'object' ? { ...issue, photo_urls: sign(issue.photo_urls) } : issue
        )
      : [],
    maintenance_requests: mrByVisit.get(v.id) ?? [],
  }));

  return NextResponse.json({ success: true, data: enriched });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!CREATE_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden. Filing visit reports requires supervisor, operations manager, or super admin access.' }, { status: 403 });
  }

  let body: any;
  try { body = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

  const operatorId: string | undefined = body.operator_id;
  if (!operatorId) {
    return NextResponse.json({ error: 'operator_id is required' }, { status: 400 });
  }

  const visitDate: string = (body.visit_date && /^\d{4}-\d{2}-\d{2}$/.test(body.visit_date))
    ? body.visit_date
    : new Date().toISOString().split('T')[0];

  // Tenant scoping — UNCONDITIONAL, same as the GET. The `role !== 'super_admin'`
  // guards below used to be skipped entirely for super_admin, which made this a
  // name-disclosure oracle: a tenant-scoped super_admin could probe another
  // tenant's operator/job ids and read back the resolved names in the response.
  const scope = await resolveTenantScope(request, auth);
  if ('response' in scope) return scope.response;
  const tenantId = scope.tenantId;

  // Look up supervisor + operator names. Verify operator exists in same tenant.
  const [{ data: supProfile }, { data: opProfile }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('full_name, tenant_id')
      .eq('id', auth.userId)
      .single(),
    supabaseAdmin
      .from('profiles')
      .select('full_name, tenant_id, role')
      .eq('id', operatorId)
      .eq('tenant_id', tenantId)
      .maybeSingle(),
  ]);

  if (!opProfile) {
    return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
  }

  // Optional job context — verify it exists in the caller's tenant
  let jobNumber: string | null = body.job_number ?? null;
  let customerName: string | null = body.customer_name ?? null;
  if (body.job_order_id) {
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, tenant_id, customer_name')
      .eq('id', body.job_order_id)
      .eq('tenant_id', tenantId)
      .maybeSingle();
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    jobNumber = job.job_number ?? jobNumber;
    customerName = job.customer_name ?? customerName;
  }

  const insert: Record<string, unknown> = {
    tenant_id: tenantId,
    supervisor_id: auth.userId,
    supervisor_name: supProfile?.full_name ?? auth.userEmail ?? '',
    operator_id: operatorId,
    operator_name: opProfile.full_name ?? '',
    job_order_id: body.job_order_id ?? null,
    job_number: jobNumber,
    customer_name: customerName,
    visit_date: visitDate,
    arrival_time: body.arrival_time ?? null,
    departure_time: body.departure_time ?? null,
    latitude: typeof body.latitude === 'number' ? body.latitude : null,
    longitude: typeof body.longitude === 'number' ? body.longitude : null,
    observations: body.observations ?? null,
    issues_flagged: body.issues_flagged ?? null,
    follow_up_required: !!body.follow_up_required,
    follow_up_notes: body.follow_up_notes ?? null,
    performance_rating: clampRating(body.performance_rating),
    safety_rating: clampRating(body.safety_rating),
    cleanliness_rating: clampRating(body.cleanliness_rating),
    photo_urls: Array.isArray(body.photo_urls) ? body.photo_urls : [],
    equipment_issues: sanitizeEquipmentIssues(body.equipment_issues),
    status: body.status === 'draft' ? 'draft' : 'submitted',
  };

  const { data, error } = await supabaseAdmin
    .from('supervisor_visits')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    console.error('supervisor-visits POST error:', error);
    return NextResponse.json({ error: 'Failed to save visit', details: error.message }, { status: 500 });
  }

  // Convert ALL open equipment issues (repair AND replace) → maintenance_requests,
  // so every supervisor-flagged issue lands in the same shop-manager inbox as operator
  // reports. request_type distinguishes a repair from a replacement.
  Promise.resolve((async () => {
    const issues: any[] = Array.isArray(data.equipment_issues) ? data.equipment_issues : [];
    const isConvertible = (e: any) =>
      (e.action === 'maintenance' || e.action === 'replace') && e.status === 'open';
    const toConvert = issues.filter(isConvertible);
    if (toConvert.length === 0) return;

    for (const issue of toConvert) {
      const isReplace = issue.action === 'replace';
      await supabaseAdmin.from('maintenance_requests').insert({
        tenant_id: data.tenant_id,
        equipment_name: issue.equipment_name || null,
        equipment_id: issue.equipment_id || null,
        submitted_by: data.supervisor_id,
        description: issue.whats_wrong || (isReplace ? 'Replacement requested via site visit' : 'Issue reported via site visit'),
        request_type: isReplace ? 'replace' : 'repair',
        priority: isReplace ? 'high' : 'medium',
        status: 'open',
        supervisor_visit_id: data.id,
        photo_urls: Array.isArray(issue.photo_urls) ? issue.photo_urls : [],
      });
    }

    // Flip converted issues to status='converted'
    const updatedIssues = issues.map((e: any) =>
      isConvertible(e) ? { ...e, status: 'converted' } : e
    );
    await supabaseAdmin
      .from('supervisor_visits')
      .update({ equipment_issues: updatedIssues })
      .eq('id', data.id);
  })()).catch(() => {});

  return NextResponse.json({ success: true, data });
}

function clampRating(v: unknown): number | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  const n = Math.round(v);
  if (n < 1 || n > 5) return null;
  return n;
}

// Validate + normalize the equipment_issues array supplied by the client.
// Each entry must have an equipment_name, whats_wrong, and a recognized action.
// Both actions are converted into maintenance_requests by the post-insert hook
// (action='maintenance' → request_type 'repair', action='replace' → 'replace'),
// so every flagged issue reaches the shop-manager inbox.
function sanitizeEquipmentIssues(v: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(v)) return [];
  const out: Array<Record<string, unknown>> = [];
  for (const raw of v) {
    if (!raw || typeof raw !== 'object') continue;
    const o = raw as Record<string, unknown>;
    const equipment_name = typeof o.equipment_name === 'string' ? o.equipment_name.trim() : '';
    const whats_wrong = typeof o.whats_wrong === 'string' ? o.whats_wrong.trim() : '';
    const action = o.action === 'replace' ? 'replace' : 'maintenance';
    if (!equipment_name && !whats_wrong) continue; // ignore empty rows
    out.push({
      equipment_name,
      equipment_id: typeof o.equipment_id === 'string' ? o.equipment_id : null,
      whats_wrong,
      action,
      photo_urls: Array.isArray(o.photo_urls) ? o.photo_urls.filter((u) => typeof u === 'string') : [],
      status: 'open', // 'converted' once Phase 2 hook fires
      created_at: new Date().toISOString(),
    });
  }
  return out;
}
