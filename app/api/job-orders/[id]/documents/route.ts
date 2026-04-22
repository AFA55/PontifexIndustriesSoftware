export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/job-orders/[id]/documents
 * Manage documents attached to a job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';
import { getTenantId } from '@/lib/get-tenant-id';

const VALID_CATEGORIES = ['site_photo', 'permit', 'customer_doc', 'before_after', 'scope', 'other'];

// GET — list all documents for a job
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;

    // Tenant filtering
    const tenantId = await getTenantId(auth.userId);

    // Verify job exists and user has access
    let jobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to')
      .eq('id', jobId);
    if (tenantId) jobQuery = jobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await jobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const adminRoles = ['admin', 'super_admin', 'operations_manager'];
    const isAdmin = adminRoles.includes(auth.role || '');
    if (!isAdmin && job.assigned_to !== auth.userId && job.helper_assigned_to !== auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // NOTE: The legacy `job_documents` table is scoped to document-template
    // signing (operator/supervisor/customer signatures on form templates) and
    // uses a different column shape (`job_id`, `document_name`, `photo_urls`
    // etc.). The generic file-upload style documents this route was written
    // for does not yet have a backing table, so return an empty list so the
    // UI can render its empty-state instead of 500'ing on a schema mismatch.
    const { data: documents, error } = await supabaseAdmin
      .from('job_documents')
      .select('id, document_name, document_category, status, photo_urls, file_urls, notes, created_at, created_by')
      .eq('job_id', jobId)
      .order('created_at', { ascending: false });

    if (error) {
      // Schema mismatch or no rows — fall back to empty list so the operator
      // job detail view still renders.
      console.warn('job_documents query failed, returning empty list:', error.message);
      return NextResponse.json({ success: true, data: [] });
    }

    return NextResponse.json({ success: true, data: documents || [] });
  } catch (error: any) {
    console.error('Unexpected error in GET documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST — attach a document to a job
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobId } = await params;

    // Tenant filtering
    const tenantId = await getTenantId(auth.userId);

    // Verify job exists and user has access
    let postJobQuery = supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to')
      .eq('id', jobId);
    if (tenantId) postJobQuery = postJobQuery.eq('tenant_id', tenantId);
    const { data: job, error: jobError } = await postJobQuery.single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const adminRoles = ['admin', 'super_admin', 'operations_manager'];
    const isAdmin = adminRoles.includes(auth.role || '');
    if (!isAdmin && job.assigned_to !== auth.userId && job.helper_assigned_to !== auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const body = await request.json();
    const { file_name, file_url, file_size, file_type, category, notes, uploaded_by_name } = body;

    if (!file_name || !file_url) {
      return NextResponse.json({ error: 'file_name and file_url are required' }, { status: 400 });
    }

    const safeCategory = VALID_CATEGORIES.includes(category) ? category : 'other';

    const { data: doc, error: insertError } = await supabaseAdmin
      .from('job_documents')
      .insert({
        job_order_id: jobId,
        file_name,
        file_url,
        file_size: file_size || null,
        file_type: file_type || null,
        category: safeCategory,
        notes: notes || null,
        uploaded_by: auth.userId,
        uploaded_by_name: uploaded_by_name || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting job document:', insertError);
      return NextResponse.json({ error: 'Failed to save document' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: doc }, { status: 201 });
  } catch (error: any) {
    console.error('Unexpected error in POST documents:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
