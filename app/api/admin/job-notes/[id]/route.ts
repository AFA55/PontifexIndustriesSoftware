/**
 * API Route: PATCH/DELETE /api/admin/job-notes/[id]
 * Edit or delete a job note (admin only, author-restricted for edits)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

// PATCH: Update a note's content (author only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;
    const body = await request.json();

    if (!body.content) {
      return NextResponse.json(
        { error: 'Missing required field: content' },
        { status: 400 }
      );
    }

    // Verify the note exists and belongs to this author
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('job_notes')
      .select('author_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    if (existing.author_id !== auth.userId) {
      return NextResponse.json(
        { error: 'You can only edit your own notes' },
        { status: 403 }
      );
    }

    const { data: note, error } = await supabaseAdmin
      .from('job_notes')
      .update({
        content: body.content,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Error updating job note:', error);
      return NextResponse.json(
        { error: 'Failed to update note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: note });
  } catch (error) {
    console.error('Unexpected error in PATCH /api/admin/job-notes/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a note (author only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id } = await params;

    // Verify the note exists and belongs to this author
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('job_notes')
      .select('author_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json(
        { error: 'Note not found' },
        { status: 404 }
      );
    }

    if (existing.author_id !== auth.userId) {
      return NextResponse.json(
        { error: 'You can only delete your own notes' },
        { status: 403 }
      );
    }

    const { error } = await supabaseAdmin
      .from('job_notes')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting job note:', error);
      return NextResponse.json(
        { error: 'Failed to delete note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/job-notes/[id]:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
