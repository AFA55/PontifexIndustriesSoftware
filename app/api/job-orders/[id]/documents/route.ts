/**
 * API Route: GET/POST /api/job-orders/[id]/documents
 * Manage documents attached to a job order
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAuth } from '@/lib/api-auth';

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

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to')
      .eq('id', jobId)
      .single();

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    const adminRoles = ['admin', 'super_admin', 'operations_manager'];
    const isAdmin = adminRoles.includes(auth.role || '');
    if (!isAdmin && job.assigned_to !== auth.userId && job.helper_assigned_to !== auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { data: documents, error } = await supabaseAdmin
      .from('job_documents')
      .select('*')
      .eq('job_order_id', jobId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching job documents:', error);
      return NextResponse.json({ error: 'Failed to fetch documents' }, { status: 500 });
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

    // Verify job exists and user has access
    const { data: job, error: jobError } = await supabaseAdmin
      .from('job_orders')
      .select('id, assigned_to, helper_assigned_to')
      .eq('id', jobId)
      .single();

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
