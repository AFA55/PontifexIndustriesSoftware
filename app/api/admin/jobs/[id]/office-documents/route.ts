export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/jobs/[id]/office-documents
 * Management-only legal/billing paperwork attached to a job.
 *
 * GET  — list office documents for the job
 * POST — create a document record (after the file was uploaded via /upload)
 *
 * Roles allowed: admin, super_admin, operations_manager, supervisor, salesman.
 * Operators / apprentices / shop roles are blocked by `requireSalesStaff`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireSalesStaff } from '@/lib/api-auth';

type RouteContext = { params: Promise<{ id: string }> };

const DOC_TYPES = new Set(['contract', 'change_order', 'signed_legal', 'permit', 'invoice_doc', 'other']);

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;

    let query = supabaseAdmin
      .from('office_documents')
      .select(`
        id,
        job_order_id,
        tenant_id,
        file_url,
        file_name,
        file_size,
        doc_type,
        description,
        total_cost,
        uploaded_by,
        created_at,
        uploader:uploaded_by(full_name)
      `)
      .eq('job_order_id', jobId)
      .order('created_at', { ascending: false });

    // super_admin (null tenant) sees all rows for the job; others are scoped.
    if (tenantId) query = query.eq('tenant_id', tenantId);

    const { data, error } = await query;
    if (error) {
      console.error('Error fetching office documents:', error);
      return NextResponse.json({ error: 'Failed to fetch office documents' }, { status: 500 });
    }

    const totalCost = (data || []).reduce((sum, d) => sum + Number(d.total_cost || 0), 0);

    return NextResponse.json({
      success: true,
      data: { documents: data || [], total_cost: totalCost },
    });
  } catch (error: unknown) {
    console.error('Unexpected error in GET /office-documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireSalesStaff(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await context.params;
    const tenantId = auth.tenantId;
    const body = await request.json();

    const { file_url, file_name, file_size, doc_type, description, total_cost } = body;

    const docType = DOC_TYPES.has(doc_type) ? doc_type : 'other';

    // Verify job exists; scope by tenant for non-super-admins.
    let jobQuery = supabaseAdmin.from('job_orders').select('id, tenant_id').eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job } = await jobQuery.single();
    if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 });

    const { data: newDoc, error } = await supabaseAdmin
      .from('office_documents')
      .insert({
        job_order_id: jobId,
        tenant_id: tenantId ?? job.tenant_id ?? null,
        file_url: file_url || null,
        file_name: file_name || null,
        file_size: file_size != null && !isNaN(Number(file_size)) ? Number(file_size) : null,
        doc_type: docType,
        description: description ? String(description).trim() : null,
        total_cost: total_cost != null && total_cost !== '' && !isNaN(Number(total_cost)) ? Number(total_cost) : null,
        uploaded_by: auth.userId,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating office document:', error);
      return NextResponse.json({ error: 'Failed to create office document' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: newDoc }, { status: 201 });
  } catch (error: unknown) {
    console.error('Unexpected error in POST /office-documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
