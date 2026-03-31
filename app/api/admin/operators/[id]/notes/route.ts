/**
 * API Route: GET/POST/DELETE /api/admin/operators/[id]/notes
 * Manage operator notes (general, performance reviews, incidents, commendations, warnings, training).
 * Stored in the `operator_notes` table with author tracking.
 *
 * GET: Fetch all notes for an operator
 * POST: Add a new note
 * DELETE: Remove a note (super_admin only), pass ?noteId=<uuid>
 *
 * Access: admin, super_admin, operations_manager, salesman, supervisor
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api-auth';
import { supabaseAdmin } from '@/lib/supabase-admin';

const VALID_NOTE_TYPES = [
  'general',
  'performance_review',
  'incident',
  'commendation',
  'warning',
  'training',
] as const;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: operatorId } = await params;

    // Fetch notes with author info
    const { data: notes, error } = await supabaseAdmin
      .from('operator_notes')
      .select('id, operator_id, author_id, note_type, title, content, is_private, created_at, updated_at')
      .eq('operator_id', operatorId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching operator notes:', error);
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }

    // Enrich with author names via a separate query to avoid FK alias issues
    const authorIds = [...new Set((notes || []).map(n => n.author_id).filter(Boolean))];
    let authorMap: Record<string, { full_name: string; email: string }> = {};

    if (authorIds.length > 0) {
      const { data: authors } = await supabaseAdmin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', authorIds);

      if (authors) {
        for (const a of authors) {
          authorMap[a.id] = { full_name: a.full_name, email: a.email };
        }
      }
    }

    const enrichedNotes = (notes || []).map(note => ({
      ...note,
      author_name: authorMap[note.author_id]?.full_name || 'Unknown',
      author_email: authorMap[note.author_id]?.email || null,
    }));

    return NextResponse.json({ success: true, data: enrichedNotes });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/operators/[id]/notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { id: operatorId } = await params;
    const body = await request.json();
    const { title, content, note_type, is_private } = body;

    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return NextResponse.json({ error: 'Content is required' }, { status: 400 });
    }

    // Validate note_type
    const resolvedType = note_type || 'general';
    if (!VALID_NOTE_TYPES.includes(resolvedType)) {
      return NextResponse.json(
        { error: `Invalid note type. Must be one of: ${VALID_NOTE_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    // Verify operator exists
    const { data: operator, error: opError } = await supabaseAdmin
      .from('profiles')
      .select('id, full_name')
      .eq('id', operatorId)
      .single();

    if (opError || !operator) {
      return NextResponse.json({ error: 'Operator not found' }, { status: 404 });
    }

    // Insert note
    const { data: note, error: insertError } = await supabaseAdmin
      .from('operator_notes')
      .insert({
        operator_id: operatorId,
        author_id: auth.userId,
        title: title.trim(),
        content: content.trim(),
        note_type: resolvedType,
        is_private: is_private === true,
      })
      .select('id, operator_id, author_id, note_type, title, content, is_private, created_at, updated_at')
      .single();

    if (insertError) {
      console.error('Error creating operator note:', insertError);
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        user_role: auth.role,
        action: 'operator_note',
        resource_type: 'profile',
        resource_id: operatorId,
        details: {
          note_id: note.id,
          note_type: resolvedType,
          title: title.trim(),
          operator_name: operator.full_name,
          is_private: is_private === true,
        },
      })
    ).catch(() => {});

    // Enrich with author info
    const enrichedNote = {
      ...note,
      author_name: auth.userEmail, // Will be resolved by caller or use email as fallback
      author_email: auth.userEmail,
    };

    // Look up the author's name
    const { data: authorProfile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    if (authorProfile) {
      enrichedNote.author_name = authorProfile.full_name;
    }

    return NextResponse.json({ success: true, data: enrichedNote }, { status: 201 });
  } catch (error) {
    console.error('Unexpected error in POST /api/admin/operators/[id]/notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    // Only super_admin can delete notes
    if (auth.role !== 'super_admin') {
      return NextResponse.json(
        { error: 'Only super admins can delete notes' },
        { status: 403 }
      );
    }

    const { id: operatorId } = await params;
    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('noteId');

    if (!noteId) {
      return NextResponse.json({ error: 'noteId query parameter is required' }, { status: 400 });
    }

    // Verify the note belongs to this operator before deleting
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('operator_notes')
      .select('id, title, note_type, operator_id')
      .eq('id', noteId)
      .eq('operator_id', operatorId)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Note not found for this operator' }, { status: 404 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from('operator_notes')
      .delete()
      .eq('id', noteId)
      .eq('operator_id', operatorId);

    if (deleteError) {
      console.error('Error deleting operator note:', deleteError);
      return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        user_email: auth.userEmail,
        user_role: auth.role,
        action: 'delete_operator_note',
        resource_type: 'profile',
        resource_id: operatorId,
        details: {
          note_id: noteId,
          note_type: existing.note_type,
          title: existing.title,
        },
      })
    ).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/operators/[id]/notes:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
