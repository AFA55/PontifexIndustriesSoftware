/**
 * API Route: GET/POST /api/admin/daily-notes
 * Fetch and create daily notes for the schedule board (per-date scratchpad)
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireScheduleBoardAccess } from '@/lib/api-auth';

// GET: Fetch notes for a specific date
export async function GET(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date');

    if (!date) {
      return NextResponse.json(
        { error: 'Missing required parameter: date' },
        { status: 400 }
      );
    }

    const { data: notes, error } = await supabaseAdmin
      .from('daily_notes')
      .select('*')
      .eq('note_date', date)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching daily notes:', error);
      return NextResponse.json(
        { error: 'Failed to fetch notes' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: notes || [] });
  } catch (error) {
    console.error('Unexpected error in GET /api/admin/daily-notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: Create a new daily note
export async function POST(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();

    if (!body.date || !body.content) {
      return NextResponse.json(
        { error: 'Missing required fields: date, content' },
        { status: 400 }
      );
    }

    // Get author name from profile
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', auth.userId)
      .single();

    const authorName = profile?.full_name || 'Unknown';

    const { data: note, error } = await supabaseAdmin
      .from('daily_notes')
      .insert({
        note_date: body.date,
        author_id: auth.userId,
        author_name: authorName,
        content: body.content,
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating daily note:', error);
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
    console.error('Unexpected error in POST /api/admin/daily-notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: Remove a daily note
export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireScheduleBoardAccess(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const noteId = searchParams.get('id');

    if (!noteId) {
      return NextResponse.json(
        { error: 'Missing required parameter: id' },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from('daily_notes')
      .delete()
      .eq('id', noteId);

    if (error) {
      console.error('Error deleting daily note:', error);
      return NextResponse.json(
        { error: 'Failed to delete note' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, message: 'Note deleted' });
  } catch (error) {
    console.error('Unexpected error in DELETE /api/admin/daily-notes:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
