/**
 * API Route: GET/POST /api/admin/job-notes
 * Fetch and create notes for job orders (admin only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

// GET: Fetch notes for a specific job order
export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const jobOrderId = searchParams.get('jobOrderId');

    if (!jobOrderId) {
      return NextResponse.json(
        { error: 'Missing required parameter: jobOrderId' },
        { status: 400 }
      );
    }

    const { data: notes, error } = await supabaseAdmin
      .from('job_notes')
      .select('*')
      .eq('job_order_id', jobOrderId)
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

    const body = await request.json();

    if (!body.jobOrderId || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields: jobOrderId, content' },
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
        job_order_id: body.jobOrderId,
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
