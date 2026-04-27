export const dynamic = 'force-dynamic';

/**
 * GET/POST /api/job-orders/[id]/notes
 * Proxy for job notes — delegates to job_notes table.
 * GET: admin/ops access only.
 * POST: any authenticated user (operators post notes from their workflow).
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess, requireAuth } from '@/lib/api-auth';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { id: jobOrderId } = await params;

    const { data: notes, error } = await supabaseAdmin
      .from('job_notes')
      .select('*')
      .eq('job_order_id', jobOrderId)
      .neq('note_type', 'change_log')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching job notes:', error);
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: notes || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/job-orders/[id]/notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Any authenticated user can post notes (operators post from their workflow)
    const auth = await requireAuth(request);
    if (!auth.authorized) return auth.response;

    const { id: jobOrderId } = await params;
    const body = await request.json();

    if (!body.content) {
      return NextResponse.json(
        { error: 'Missing required field: content' },
        { status: 400 }
      );
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
        job_order_id: jobOrderId,
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
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }

    // Fire-and-forget: notify all admins/ops-managers in this tenant
    Promise.resolve((async () => {
      try {
        // Fetch the job number for a meaningful notification message
        const { data: jobOrder } = await supabaseAdmin
          .from('job_orders')
          .select('job_number')
          .eq('id', jobOrderId)
          .single();

        const jobNumber = jobOrder?.job_number ?? jobOrderId;
        const preview = body.content.length > 80
          ? body.content.substring(0, 80) + '…'
          : body.content;
        const noteTypeLabel = (body.noteType || 'manual').replace(/_/g, ' ');

        // Get all admins in the tenant
        const { data: admins } = await supabaseAdmin
          .from('profiles')
          .select('id')
          .in('role', ['super_admin', 'operations_manager', 'admin'])
          .eq('tenant_id', auth.tenantId || '');

        if (admins && admins.length > 0) {
          const notifications = admins.map((a: { id: string }) => ({
            user_id: a.id,
            type: 'operator_note',
            title: 'Operator Note Added',
            message: `${authorName} left a ${noteTypeLabel} note on ${jobNumber}: "${preview}"`,
            job_id: jobOrderId,
            tenant_id: auth.tenantId || null,
            related_entity_type: 'job_note',
            related_entity_id: note.id,
            action_url: `/dashboard/admin/jobs/${jobOrderId}`,
            read: false,
            is_read: false,
          }));
          await supabaseAdmin.from('notifications').insert(notifications);
        }
      } catch {
        // Non-critical — never block the response
      }
    })()).catch(() => {});

    return NextResponse.json(
      { success: true, message: 'Note created', data: note },
      { status: 201 }
    );
  } catch (error) {
    console.error('Unexpected error in POST /api/job-orders/[id]/notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
