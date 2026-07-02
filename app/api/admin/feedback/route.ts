export const dynamic = 'force-dynamic';

/**
 * Admin/triage feedback API.
 *
 * GET /api/admin/feedback  — list feedback for triage (requireAdmin).
 *   - super_admin: ALL tenants.
 *   - admin / operations_manager: only their own tenant.
 *   - optional ?status= filter (open|in_review|planned|done|declined).
 *
 * Returns an ARRAY (top-level) shaped exactly:
 *   { id, status, type, title, body, tenant_id, tenant_name,
 *     reporter_role, page_url, admin_response, created_at,
 *     ai_analysis, ai_analyzed_at }
 * (The Hub consumes a top-level array; we also include it under no wrapper.)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

const VALID_STATUSES = ['open', 'in_review', 'planned', 'done', 'declined'];

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized) return auth.response;

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get('status');

  let query = supabaseAdmin
    .from('feedback_submissions')
    .select(
      'id, status, type, title, body, tenant_id, reporter_role, page_url, admin_response, created_at, ai_analysis, ai_analyzed_at, tenants(name)'
    )
    .order('created_at', { ascending: false })
    .limit(500);

  // Tenant scope: super_admin sees all; everyone else only their tenant.
  if (auth.role !== 'super_admin') {
    query = query.eq('tenant_id', auth.tenantId);
  }

  if (statusFilter && VALID_STATUSES.includes(statusFilter)) {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;

  if (error) {
    console.error('admin feedback GET error:', error);
    return NextResponse.json(
      { error: 'Failed to load feedback', details: error.message },
      { status: 500 }
    );
  }

  const rows = (data ?? []).map((r: any) => ({
    id: r.id,
    status: r.status,
    type: r.type,
    title: r.title,
    body: r.body,
    tenant_id: r.tenant_id,
    tenant_name: r.tenants?.name ?? null,
    reporter_role: r.reporter_role,
    page_url: r.page_url,
    admin_response: r.admin_response,
    created_at: r.created_at,
    ai_analysis: r.ai_analysis ?? null,
    ai_analyzed_at: r.ai_analyzed_at ?? null,
  }));

  return NextResponse.json(rows);
}
