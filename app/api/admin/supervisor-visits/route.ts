export const dynamic = 'force-dynamic';

/**
 * GET  /api/admin/supervisor-visits  -> list visits (scope: own for supervisor, all-in-tenant for admin/ops/super)
 * POST /api/admin/supervisor-visits  -> create a visit (supervisors + admins)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

const WRITE_ROLES = new Set(['supervisor', 'admin', 'super_admin', 'operations_manager']);

export async function GET(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!WRITE_ROLES.has(auth.role) && auth.role !== 'salesman') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const operatorId = searchParams.get('operator_id');
  const startDate = searchParams.get('start_date');
  const endDate = searchParams.get('end_date');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10), 200);

  let query = supabaseAdmin
    .from('supervisor_visits')
    .select('*')
    .order('visit_date', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // Tenant scoping (super_admin sees all)
  if (auth.role !== 'super_admin' && auth.tenantId) {
    query = query.eq('tenant_id', auth.tenantId);
  }

  // Supervisors only see their own
  if (auth.role === 'supervisor') {
    query = query.eq('supervisor_id', auth.userId);
  }

  if (operatorId) query = query.eq('operator_id', operatorId);
  if (startDate) query = query.gte('visit_date', startDate);
  if (endDate) query = query.lte('visit_date', endDate);

  const { data, error } = await query;
  if (error) {
    console.error('supervisor-visits GET error:', error);
    return NextResponse.json({ error: 'Failed to load visits' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth(request);
  if (!auth.authorized) return auth.response;

  if (!WRITE_ROLES.has(auth.role)) {
    return NextResponse.json({ error: 'Forbidden. Supervisor or admin access required.' }, { status: 403 });
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
      .single(),
  ]);

  if (!opProfile) {
    return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
  }

  // Tenant guard for non-super-admins
  if (auth.role !== 'super_admin' && opProfile.tenant_id !== auth.tenantId) {
    return NextResponse.json({ error: 'Operator outside your tenant' }, { status: 403 });
  }

  // Optional job context — verify it exists + (for non-super) is in tenant
  let jobNumber: string | null = body.job_number ?? null;
  let customerName: string | null = body.customer_name ?? null;
  if (body.job_order_id) {
    const { data: job } = await supabaseAdmin
      .from('job_orders')
      .select('id, job_number, tenant_id, customer_name')
      .eq('id', body.job_order_id)
      .single();
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
    if (auth.role !== 'super_admin' && job.tenant_id !== auth.tenantId) {
      return NextResponse.json({ error: 'Job outside your tenant' }, { status: 403 });
    }
    jobNumber = job.job_number ?? jobNumber;
    customerName = job.customer_name ?? customerName;
  }

  const insert: Record<string, unknown> = {
    tenant_id: auth.tenantId ?? opProfile.tenant_id ?? null,
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

  return NextResponse.json({ success: true, data });
}

function clampRating(v: unknown): number | null {
  if (typeof v !== 'number' || Number.isNaN(v)) return null;
  const n = Math.round(v);
  if (n < 1 || n > 5) return null;
  return n;
}
