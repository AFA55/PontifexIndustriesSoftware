export const dynamic = 'force-dynamic';

/**
 * API Route: /api/admin/dashboard-notes
 * CRUD for personal/shared dashboard sticky notes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { data, error } = await supabaseAdmin
      .from('dashboard_notes')
      .select('*')
      .or(`user_id.eq.${auth.userId},shared.eq.true`)
      .order('pinned', { ascending: false })
      .order('position', { ascending: true });

    if (error) {
      console.error('Error fetching dashboard notes:', error);
      return NextResponse.json({ error: 'Failed to fetch notes' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error: any) {
    console.error('Error in dashboard-notes GET:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { title, content, color } = body;

    if (!content && !title) {
      return NextResponse.json({ error: 'Title or content is required' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dashboard_notes')
      .insert({
        user_id: auth.userId,
        title: title || '',
        content: content || '',
        color: color || 'yellow',
      })
      .select()
      .single();

    if (error) {
      console.error('Error creating dashboard note:', error);
      return NextResponse.json({ error: 'Failed to create note' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'dashboard_note_created',
        entity_type: 'dashboard_note',
        entity_id: data.id,
        details: { title: title || '' },
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in dashboard-notes POST:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const body = await request.json();
    const { id, title, content, color, pinned, shared, position } = body;

    if (!id) {
      return NextResponse.json({ error: 'Note id is required' }, { status: 400 });
    }

    const updates: Record<string, any> = {};
    if (title !== undefined) updates.title = title;
    if (content !== undefined) updates.content = content;
    if (color !== undefined) updates.color = color;
    if (pinned !== undefined) updates.pinned = pinned;
    if (shared !== undefined) updates.shared = shared;
    if (position !== undefined) updates.position = position;

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from('dashboard_notes')
      .update(updates)
      .eq('id', id)
      .eq('user_id', auth.userId)
      .select()
      .single();

    if (error) {
      console.error('Error updating dashboard note:', error);
      return NextResponse.json({ error: 'Failed to update note' }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ error: 'Note not found or not owned by you' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    console.error('Error in dashboard-notes PUT:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAdmin(request);
    if (!auth.authorized) return auth.response;

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Note id is required' }, { status: 400 });
    }

    const { error } = await supabaseAdmin
      .from('dashboard_notes')
      .delete()
      .eq('id', id)
      .eq('user_id', auth.userId);

    if (error) {
      console.error('Error deleting dashboard note:', error);
      return NextResponse.json({ error: 'Failed to delete note' }, { status: 500 });
    }

    // Fire-and-forget audit log
    Promise.resolve(
      supabaseAdmin.from('audit_logs').insert({
        user_id: auth.userId,
        action: 'dashboard_note_deleted',
        entity_type: 'dashboard_note',
        entity_id: id,
        details: {},
      })
    ).then(() => {}).catch(() => {});

    return NextResponse.json({ success: true, data: { deleted: id } });
  } catch (error: any) {
    console.error('Error in dashboard-notes DELETE:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
