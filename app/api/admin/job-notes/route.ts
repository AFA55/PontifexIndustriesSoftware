export const dynamic = 'force-dynamic';

/**
 * API Route: GET/POST /api/admin/job-notes
 * Fetch and create notes for job orders (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess, resolveTenantScope } from '@/lib/api-auth';

// GET: Fetch notes for a specific job order
export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const { searchParams } = new URL(request.url);
    const jobOrderId = searchParams.get('jobOrderId');

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'Missing required parameter: jobOrderId' },
        { status: 400 }
      );
    }

    // Verify the parent job belongs to the caller's tenant (prevents reading
    // another tenant's notes by guessing job_order_id).
    const { data: parentJob } = await supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', jobOrderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!parentJob) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    const { data: notes, error } = await supabaseAdmin
      .from('job_notes')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .eq('tenant_id', tenantId)
      .neq('note_type', 'change_log')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching job notes:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: notes || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/job-notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create a new note on a job order
export async function POST(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const scope = await resolveTenantScope(request, auth);
    if ('response' in scope) return scope.response;
    const tenantId = scope.tenantId;

    const body = await request.json();

    if (!body.jobOrderId || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields: jobOrderId, content' },
        { status: 400 }
      );
    }

    // Verify the parent job belongs to the caller's tenant before inserting a
    // note against it (prevents cross-tenant note injection).
    const { data: parentJob } = await supabaseAdmin
      .from('job_orders')
      .select('id')
      .eq('id', body.jobOrderId)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!parentJob) {
      return NextResponse.json({ error: 'Job order not found' }, { status: 404 });
    }

    // Get author name from profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const authorName = profile?.full_name || auth.userEmail;

    const { data: note, error } = await supabaseAdmin
      .from('job_notes')
      .insert({
        job_order_id: body.jobOrderId,
        tenant_id: tenantId,
        author_id: auth.userId,
        author_name: authorName,
        content: body.content,
        note_type: body.noteType || 'manual',
        metadata: body.metadata || {},
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating job note:', error);
      return NextResponse.json(
        { error: 'Failed to create note' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Note created', data: note },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/job-notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
